import { animated, to, useTransition } from '@react-spring/web'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { homeFor, useAuth } from '../lib/auth'
import { formatDate, titleCase } from '../lib/format'
import { springs } from '../lib/motion/config'
import type { EventView } from '../lib/types'

interface Command {
  id: string
  group: 'Go to' | 'Events' | 'Manage' | 'Actions'
  label: string
  hint?: string
  run: () => void
}

/** Subsequence match with a bonus for word starts and contiguous runs; 0 means no match. */
function score(query: string, text: string): number {
  if (!query) return 1
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (t.includes(q)) return 100 - t.indexOf(q)
  let ti = 0
  let s = 0
  let run = 0
  for (const ch of q) {
    const found = t.indexOf(ch, ti)
    if (found < 0) return 0
    run = found === ti ? run + 1 : 0
    s += 1 + run + (found === 0 || t[found - 1] === ' ' ? 3 : 0)
    ti = found + 1
  }
  return s
}

export const PALETTE_EVENT = 'pulse:palette'

/** Ctrl/Cmd + K anywhere: jump to any page, event or action from the keyboard. */
export function CommandPalette() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [events, setEvents] = useState<EventView[]>([])
  const [mine, setMine] = useState<EventView[]>([])
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)

  const close = useCallback(() => { setOpen(false); setQuery(''); setActive(0) }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener(PALETTE_EVENT, onOpen)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener(PALETTE_EVENT, onOpen) }
  }, [])

  // Fresh data each time it opens.
  useEffect(() => {
    if (!open) return
    api.events().then(setEvents).catch(() => setEvents([]))
    if (user && user.role !== 'ATTENDEE') api.myEvents().then(setMine).catch(() => setMine([]))
    setTimeout(() => input.current?.focus(), 30)
  }, [open, user])

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => navigate(to)
    const c: Command[] = [
      { id: 'home', group: 'Go to', label: 'Home', run: go('/') },
      { id: 'events', group: 'Go to', label: 'Browse events', run: go('/events') },
    ]
    if (!user) {
      c.push({ id: 'login', group: 'Go to', label: 'Sign in', run: go('/login') },
        { id: 'signup', group: 'Go to', label: 'Create an account', run: go('/signup') })
    } else {
      c.push({ id: 'dash', group: 'Go to', label: 'My dashboard', hint: user.role.toLowerCase(), run: go(homeFor(user.role)) })
      if (user.role === 'ATTENDEE') c.push({ id: 'tickets', group: 'Go to', label: 'My tickets', run: go('/tickets') })
      if (user.role !== 'ATTENDEE') {
        c.push({ id: 'new', group: 'Actions', label: 'Create a new event', run: go('/organizer/events/new') },
          { id: 'scan', group: 'Actions', label: 'Scan tickets at the door', run: go('/organizer/checkin') })
      }
      if (user.role === 'ADMIN') c.push({ id: 'admin', group: 'Go to', label: 'Admin console', run: go('/admin') })
      c.push({ id: 'logout', group: 'Actions', label: 'Sign out', run: () => { logout(); navigate('/') } })
    }
    for (const e of events) {
      c.push({ id: `e${e.id}`, group: 'Events', label: e.title, hint: `${formatDate(e.startAt)} · ${titleCase(e.category)}`,
        run: go(`/events/${e.id}`) })
    }
    for (const e of mine) {
      c.push({ id: `m${e.id}`, group: 'Manage', label: `Manage: ${e.title}`, hint: e.status.toLowerCase(),
        run: go(`/organizer/events/${e.id}`) })
      if (e.status === 'APPROVED') {
        c.push({ id: `w${e.id}`, group: 'Manage', label: `Live wall: ${e.title}`, run: go(`/organizer/events/${e.id}/wall`) })
      }
    }
    return c
  }, [events, mine, user, navigate, logout])

  // Best matches first, but each group stays together (ordered by its best match).
  const results = useMemo(() => {
    const ranked = commands
      .map((c) => ({ c, s: score(query, `${c.label} ${c.hint ?? ''}`) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => (query ? b.s - a.s : 0))
      .slice(0, 40)
      .map((x) => x.c)
    const groups = [...new Set(ranked.map((c) => c.group))]
    return groups.flatMap((g) => ranked.filter((c) => c.group === g))
  }, [commands, query])

  useEffect(() => { setActive(0) }, [query])
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
    else if (e.key === 'Enter' && results[active]) { e.preventDefault(); results[active].run(); close() }
    else if (e.key === 'Escape') close()
  }

  const t = useTransition(open, {
    from: { o: 0, y: -16, s: 0.97 },
    enter: { o: 1, y: 0, s: 1 },
    leave: { o: 0, y: -10, s: 0.98 },
    config: springs.snappy,
  })

  let lastGroup = ''
  return t((style, show) => show && (
    <animated.div className="fixed inset-0 z-[60] flex items-start justify-center bg-background/60 px-4 pt-[14vh] backdrop-blur-sm"
      style={{ opacity: style.o }} onMouseDown={close}>
      <animated.div role="dialog" aria-modal="true" aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ transform: to([style.y, style.s], (y, s) => `translateY(${y}px) scale(${s})`) }}
        className="w-full max-w-xl overflow-hidden rounded-panel border border-border-strong bg-surface-raised shadow-[0_40px_120px_-20px_rgb(0_0_0/0.8)] backdrop-blur-glass">
        <div className="flex items-center gap-3 border-b border-border px-5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-foreground-subtle" aria-hidden>
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input ref={input} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown}
            placeholder="Search events, pages and actions…" aria-label="Search commands"
            role="combobox" aria-expanded="true" aria-controls="palette-list"
            aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
            className="h-14 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-foreground-faint" />
          <kbd className="rounded-md border border-border-strong px-1.5 py-0.5 font-mono text-xs text-foreground-subtle">Esc</kbd>
        </div>
        <ul id="palette-list" ref={list} role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 && <li className="px-4 py-8 text-center text-sm text-foreground-subtle">No matches.</li>}
          {results.map((c, i) => {
            const header = c.group !== lastGroup ? c.group : null
            lastGroup = c.group
            return (
              <li key={c.id} role="presentation">
                {header && <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-eyebrow text-foreground-faint">{header}</p>}
                <button type="button" id={`cmd-${c.id}`} role="option" aria-selected={i === active} data-index={i}
                  onMouseMove={() => setActive(i)} onClick={() => { c.run(); close() }}
                  className={`flex w-full cursor-pointer items-center justify-between gap-4 rounded-control px-3 py-2.5 text-left text-sm transition duration-[var(--duration-fast)] ${
                    i === active ? 'bg-accent-veil text-accent' : 'text-foreground'}`}>
                  <span className="truncate">{c.label}</span>
                  {c.hint && <span className="shrink-0 text-xs text-foreground-subtle">{c.hint}</span>}
                </button>
              </li>
            )
          })}
        </ul>
        <div className="flex items-center gap-4 border-t border-border px-5 py-2.5 text-xs text-foreground-subtle">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">Enter</kbd> open</span>
          <span className="ml-auto">pulse</span>
        </div>
      </animated.div>
    </animated.div>
  ))
}
