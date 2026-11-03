import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Page } from '../components/Layout'
import { EventCard } from '../components/EventCard'
import { Empty, ErrorNote, Eyebrow, Input, Loading, PageHeader } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { titleCase } from '../lib/format'
import { Inview } from '../lib/motion/Inview'
import { STAGGER } from '../lib/motion/config'
import { CATEGORIES, type Category, type EventView, type Recommendation } from '../lib/types'

function PickedForYou() {
  const [picks, setPicks] = useState<Recommendation[] | null>(null)
  useEffect(() => { api.recommendations().then(setPicks).catch(() => setPicks([])) }, [])
  if (!picks || picks.length === 0) return null
  return (
    <section className="mt-12" aria-labelledby="picks-title">
      <Eyebrow>Picked for you</Eyebrow>
      <h2 id="picks-title" className="mt-2 text-2xl font-semibold tracking-tight">
        Based on what you've <span className="font-serif font-normal italic text-accent">booked and loved.</span>
      </h2>
      <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {picks.map((p, i) => (
          <Inview key={p.event.id} tag="li" delayIn={i * STAGGER} className="flex h-full flex-col gap-3">
            <p className="flex items-center gap-2 text-sm text-accent">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" />
              </svg>
              {p.reason}
            </p>
            <div className="flex-1"><EventCard event={p.event} /></div>
          </Inview>
        ))}
      </ul>
    </section>
  )
}

export function Events() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const category = (params.get('category') as Category | null) ?? undefined
  const includePast = params.get('past') === '1'
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [events, setEvents] = useState<EventView[] | null>(null)
  const [error, setError] = useState('')

  // Debounced search so typing doesn't fire a request per key.
  useEffect(() => {
    const id = window.setTimeout(() => {
      setError('')
      api.events(query, category, includePast).then(setEvents).catch((e: Error) => setError(e.message))
    }, 220)
    return () => window.clearTimeout(id)
  }, [query, category, includePast])

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const chip = (active: boolean) =>
    `cursor-pointer rounded-pill border px-3.5 py-1.5 text-sm transition duration-[var(--duration-fast)] ${
      active ? 'border-accent bg-accent-veil text-accent' : 'border-border-strong text-foreground-muted hover:text-foreground'}`

  return (
    <Page>
      <PageHeader eyebrow="Discover" title="What's" accent="on." />
      <div className="mt-10 flex flex-col gap-4">
        <div className="relative max-w-xl">
          <svg className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-foreground-subtle" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <Input
            type="search"
            aria-label="Search events"
            placeholder="Search by title or venue"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setParam('q', e.target.value || null) }}
            className="pl-11"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by category">
          <button type="button" className={chip(!category)} onClick={() => setParam('category', null)}>All</button>
          {CATEGORIES.map((c) => (
            <button key={c} type="button" className={chip(category === c)} aria-pressed={category === c}
              onClick={() => setParam('category', category === c ? null : c)}>
              {titleCase(c)}
            </button>
          ))}
          <label className="tap-target ml-auto flex cursor-pointer items-center gap-2 text-sm text-foreground-muted">
            <input type="checkbox" checked={includePast} onChange={(e) => setParam('past', e.target.checked ? '1' : null)}
              className="size-5 accent-[var(--accent)] pointer-coarse:size-6" />
            Include past events
          </label>
        </div>
      </div>

      {user?.role === 'ATTENDEE' && !query && !category && <PickedForYou />}

      <div className="mt-10">
        {!query && !category && user?.role === 'ATTENDEE' && <h2 className="mb-5 text-xl font-semibold">All events</h2>}
        {error && <ErrorNote message={error} />}
        {!error && events === null && <Loading label="Finding events" shape="cards" />}
        {events?.length === 0 && (
          <Empty title="No events match">Try another search or category - or check back soon.</Empty>
        )}
        {events && events.length > 0 && (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((e, i) => (
              <Inview key={e.id} tag="li" delayIn={(i % 6) * STAGGER} className="h-full"><EventCard event={e} /></Inview>
            ))}
          </ul>
        )}
      </div>
    </Page>
  )
}
