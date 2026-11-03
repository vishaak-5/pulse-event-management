import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Page } from '../components/Layout'
import { Empty, ErrorNote, Glass, LinkButton, Loading, PageHeader, StatTile, StatusBadge } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatDate, formatTime } from '../lib/format'
import { CountUp } from '../lib/motion/CountUp'
import { Inview } from '../lib/motion/Inview'
import { STAGGER } from '../lib/motion/config'
import type { EventView, OrganizerOverview } from '../lib/types'

export function OrganizerDashboard() {
  const { user } = useAuth()
  const [overview, setOverview] = useState<OrganizerOverview | null>(null)
  const [events, setEvents] = useState<EventView[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api.overview(), api.myEvents()])
      .then(([o, e]) => { setOverview(o); setEvents(e) })
      .catch((e: Error) => setError(e.message))
  }, [])

  const now = new Date()

  return (
    <Page>
      <PageHeader eyebrow="Organizer" title={`Hi, ${user?.name.split(' ')[0] ?? 'there'}.`} accent="Here's your pulse.">
        <LinkButton to="/organizer/checkin" variant="ghost">Scan tickets</LinkButton>
        <LinkButton to="/organizer/events/new">+ New event</LinkButton>
      </PageHeader>

      {error && <div className="mt-8"><ErrorNote message={error} /></div>}
      {!error && !overview && <div className="mt-10"><Loading shape="dashboard" /></div>}

      {overview && (
        <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: 'Upcoming events', value: <CountUp value={overview.upcomingEvents} />, sub: `${overview.totalEvents} total`, tone: 'accent' as const },
            { label: 'Seats booked', value: <CountUp value={overview.totalRegistrations} />, sub: 'across all events', tone: 'info' as const },
            { label: 'Checked in', value: <CountUp value={overview.totalCheckedIn} />, sub: 'scanned at the door', tone: 'special' as const },
            {
              label: 'Avg rating',
              value: overview.averageRating !== null ? <CountUp value={overview.averageRating} decimals={1} suffix=" ★" /> : '-',
              sub: overview.pendingApproval ? `${overview.pendingApproval} awaiting approval` : 'from attendees',
              tone: 'warning' as const,
            },
          ].map((s, i) => <Inview key={s.label} delayIn={i * STAGGER}><StatTile {...s} /></Inview>)}
        </div>
      )}

      {events && (
        <section className="mt-14" aria-labelledby="my-events">
          <h2 id="my-events" className="text-xl font-semibold">Your events</h2>
          {events.length === 0 ? (
            <div className="mt-5">
              <Empty title="No events yet">
                Create your first event. It goes live once an admin approves it.
                <div className="mt-5"><LinkButton to="/organizer/events/new">Create event</LinkButton></div>
              </Empty>
            </div>
          ) : (
            <Glass className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-foreground-subtle">
                  <tr className="border-b border-border">
                    <th className="px-5 py-4 font-medium">Event</th>
                    <th className="px-5 py-4 font-medium">When</th>
                    <th className="px-5 py-4 font-medium">Seats</th>
                    <th className="px-5 py-4 font-medium">Waitlist</th>
                    <th className="px-5 py-4 font-medium">Status</th>
                    <th className="px-5 py-4" />
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => {
                    const past = new Date(e.endAt) < now
                    return (
                      <tr key={e.id} className="border-b border-border last:border-0 transition duration-[var(--duration-fast)] hover:bg-surface-hover/60">
                        <td className="px-5 py-4">
                          <Link to={`/organizer/events/${e.id}`} className="tap-target inline-flex items-center font-medium hover:text-accent">{e.title}</Link>
                          <p className="text-xs text-foreground-subtle">{e.venue}</p>
                        </td>
                        <td className="px-5 py-4 text-foreground-muted">
                          {formatDate(e.startAt)}<span className="text-foreground-subtle"> · {formatTime(e.startAt)}</span>
                          {past && <span className="ml-2 text-xs text-foreground-faint">ended</span>}
                        </td>
                        <td className="px-5 py-4 tabular-nums">{e.seatsTaken}<span className="text-foreground-subtle"> / {e.capacity}</span></td>
                        <td className="px-5 py-4 tabular-nums text-foreground-muted">{e.waitlistCount || '-'}</td>
                        <td className="px-5 py-4"><StatusBadge status={e.status} /></td>
                        <td className="px-5 py-4 text-right">
                          <Link to={`/organizer/events/${e.id}`} className="tap-target inline-flex items-center text-accent hover:underline">Manage →</Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Glass>
          )}
        </section>
      )}
    </Page>
  )
}
