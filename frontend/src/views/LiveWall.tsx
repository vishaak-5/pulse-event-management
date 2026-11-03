import { animated, useSpring, useTransition } from '@react-spring/web'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Logo } from '../components/Layout'
import { ErrorNote, Loading } from '../components/ui'
import { api, streamCheckIns } from '../lib/api'
import { formatTime } from '../lib/format'
import { springs } from '../lib/motion/config'
import type { Arrival, LiveSnapshot } from '../lib/types'

const HeroScene = lazy(() => import('../scene/HeroScene'))

type Conn = 'connecting' | 'live' | 'reconnecting'

/**
 * Big-screen check-in display for the venue entrance. Totals come from a
 * snapshot, then every scan is pushed over Server-Sent Events and lands here
 * in well under a second.
 */
export function LiveWall() {
  const { id } = useParams()
  const eventId = Number(id)
  const [snap, setSnap] = useState<LiveSnapshot | null>(null)
  const [arrivals, setArrivals] = useState<(Arrival & { key: string })[]>([])
  const [counts, setCounts] = useState({ checkedIn: 0, seated: 0, capacity: 0 })
  const [conn, setConn] = useState<Conn>('connecting')
  const [welcome, setWelcome] = useState<{ name: string; key: number } | null>(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const welcomeTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])

  // Snapshot first, then keep a stream open, reconnecting with backoff if it drops.
  useEffect(() => {
    const ctrl = new AbortController()
    let attempt = 0
    let loaded = false
    async function run() {
      while (!ctrl.signal.aborted) {
        try {
          const s = await api.liveSnapshot(eventId)
          loaded = true
          setSnap(s)
          setCounts({ checkedIn: s.checkedIn, seated: s.seated, capacity: s.capacity })
          setArrivals(s.recent.map((a, i) => ({ ...a, key: `${a.at}-${i}` })))
          setConn('live')
          attempt = 0
          await streamCheckIns(eventId, (e) => {
            setCounts({ checkedIn: e.checkedIn, seated: e.seated, capacity: e.capacity })
            setArrivals((xs) => [{ name: e.attendeeName, at: e.at, key: `${e.at}-${e.attendeeName}` }, ...xs].slice(0, 14))
            setWelcome({ name: e.attendeeName, key: Date.now() })
            window.clearTimeout(welcomeTimer.current)
            welcomeTimer.current = window.setTimeout(() => setWelcome(null), 2600)
          }, ctrl.signal)
        } catch (e) {
          if (ctrl.signal.aborted) return
          // A failed first snapshot (wrong event, no access) is final; a dropped stream is retried.
          if (!loaded) {
            setError((e as Error).message)
            return
          }
        }
        if (ctrl.signal.aborted) return
        setConn('reconnecting')
        attempt++
        await new Promise((r) => setTimeout(r, Math.min(10_000, 1000 * 2 ** attempt)))
      }
    }
    run()
    return () => ctrl.abort()
  }, [eventId])

  const pct = counts.seated === 0 ? 0 : counts.checkedIn / counts.seated
  const big = useSpring({ n: counts.checkedIn, p: pct, config: springs.gentle })
  const pulse = useSpring({ from: { o: 0.35 }, to: { o: 1 }, loop: { reverse: true }, config: { duration: 900 } })
  const flash = useSpring({ glow: welcome ? 1 : 0, config: springs.snappy })

  const welcomeT = useTransition(welcome, {
    keys: (w) => w?.key ?? 0,
    from: { opacity: 0, y: 40, scale: 0.92 },
    enter: { opacity: 1, y: 0, scale: 1 },
    leave: { opacity: 0, y: -30, scale: 1.04 },
    config: springs.snappy,
  })

  const feed = useTransition(arrivals, {
    keys: (a) => a.key,
    from: { opacity: 0, x: 40 },
    enter: { opacity: 1, x: 0 },
    leave: { opacity: 0, x: -20 },
    config: springs.entrance,
  })

  // Arrivals in the last 10 minutes -> per-minute rate.
  const recent10 = arrivals.filter((a) => now - new Date(a.at).getTime() < 600_000).length
  const last = arrivals[0] ? Math.max(0, Math.round((now - new Date(arrivals[0].at).getTime()) / 1000)) : null

  if (error) return <div className="mx-auto max-w-xl px-6 pt-32"><ErrorNote message={error} /></div>
  if (!snap) return <Loading label="Opening live wall" shape="wall" />

  const R = 150
  const C = 2 * Math.PI * R

  return (
    <div className="relative h-[100svh] overflow-hidden bg-background">
      <div className="absolute inset-0 opacity-40" aria-hidden>
        <Suspense fallback={null}><HeroScene /></Suspense>
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_30%_50%,transparent,var(--background)_85%)]" />
      <animated.div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_50%_at_30%_55%,var(--accent-glow),transparent_70%)]"
        style={{ opacity: flash.glow }} />

      <div className="relative flex h-full flex-col px-[4vw] py-[3vh]">
        {/* top bar */}
        <header className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <Logo />
            <span className="h-6 w-px bg-border-strong" />
            <div>
              <h1 className="text-[clamp(1.1rem,1.8vw,1.8rem)] font-semibold leading-tight tracking-tight">{snap.title}</h1>
              <p className="text-sm text-foreground-subtle">{snap.venue}</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-2 rounded-pill border border-border-strong bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-eyebrow backdrop-blur-glass"
              role="status">
              <animated.span className={`size-2 rounded-full ${conn === 'live' ? 'bg-accent' : 'bg-warning'}`}
                style={{ opacity: pulse.o, boxShadow: '0 0 12px var(--accent)' }} />
              {conn === 'live' ? 'Live' : conn === 'connecting' ? 'Connecting' : 'Reconnecting'}
            </span>
            <span className="font-mono text-[clamp(1rem,1.6vw,1.6rem)] tabular-nums text-foreground-muted">
              {new Date(now).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <Link to={`/organizer/events/${eventId}`} className="text-sm text-foreground-subtle hover:text-accent">Exit</Link>
          </div>
        </header>

        {/* main */}
        <div className="grid flex-1 items-center gap-[4vw] lg:grid-cols-[1.25fr_1fr]">
          <section className="flex items-center gap-[3vw]" aria-label="Check-in progress">
            <div className="relative grid shrink-0 place-items-center">
              <svg viewBox="0 0 340 340" className="size-[min(38vw,46vh)] -rotate-90" aria-hidden>
                <circle cx="170" cy="170" r={R} fill="none" stroke="var(--border-strong)" strokeWidth="10" />
                <animated.circle cx="170" cy="170" r={R} fill="none" stroke="var(--accent)" strokeWidth="10"
                  strokeLinecap="round" strokeDasharray={C}
                  strokeDashoffset={big.p.to((p) => C * (1 - Math.min(1, p)))}
                  style={{ filter: 'drop-shadow(0 0 14px var(--accent))' }} />
              </svg>
              <div className="absolute text-center">
                <animated.p className="font-semibold leading-none tracking-[-0.04em] tabular-nums text-[min(11vw,15vh)]">
                  {big.n.to((n) => Math.round(n).toString())}
                </animated.p>
                <p className="mt-2 text-[clamp(0.9rem,1.3vw,1.3rem)] text-foreground-muted">
                  of <span className="text-foreground">{counts.seated}</span> checked in
                </p>
              </div>
            </div>
            <dl className="hidden flex-col gap-[3vh] xl:flex">
              {[
                ['Attendance', `${Math.round(pct * 100)}%`],
                ['Arrivals / min', (recent10 / 10).toFixed(1)],
                ['Last arrival', last === null ? '—' : last < 60 ? `${last}s ago` : `${Math.floor(last / 60)}m ago`],
                ['Still expected', String(Math.max(0, counts.seated - counts.checkedIn))],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs uppercase tracking-eyebrow text-foreground-subtle">{k}</dt>
                  <dd className="mt-1 text-[clamp(1.4rem,2.6vw,2.6rem)] font-semibold tabular-nums tracking-tight">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="flex h-[60vh] flex-col rounded-panel border border-border bg-surface p-6 backdrop-blur-glass" aria-label="Recent arrivals">
            <h2 className="text-xs font-semibold uppercase tracking-eyebrow text-accent">Just arrived</h2>
            {arrivals.length === 0 ? (
              <p className="mt-6 text-foreground-subtle">Waiting for the first scan…</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2 overflow-hidden">
                {feed((style, a, _t, i) => (
                  <animated.li style={{ opacity: style.opacity, transform: style.x.to((x) => `translateX(${x}px)`) }}
                    className={`flex items-center justify-between rounded-card px-4 py-3 ${i === 0 ? 'bg-accent-veil' : ''}`}>
                    <span className="flex items-center gap-3">
                      <span className="grid size-9 place-items-center rounded-full border border-accent/40 text-sm font-semibold text-accent">
                        {a.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="text-[clamp(1rem,1.4vw,1.4rem)] font-medium">{a.name}</span>
                    </span>
                    <span className="font-mono text-sm text-foreground-subtle">{formatTime(a.at)}</span>
                  </animated.li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* welcome flash */}
      {welcomeT((style, w) => w && (
        <animated.div aria-live="assertive"
          className="pointer-events-none absolute inset-x-0 bottom-[8vh] flex justify-center"
          style={{ opacity: style.opacity, transform: style.y.to((y) => `translateY(${y}px)`) }}>
          <animated.div style={{ transform: style.scale.to((s) => `scale(${s})`) }}
            className="rounded-pill border border-accent/50 bg-surface-raised px-10 py-5 text-center shadow-[0_0_80px_-10px_var(--accent-glow)] backdrop-blur-glass">
            <p className="text-[clamp(1.4rem,3vw,3rem)] font-semibold tracking-tight">
              Welcome, <span className="font-serif font-normal italic text-accent">{w.name}</span>
            </p>
          </animated.div>
        </animated.div>
      ))}
    </div>
  )
}
