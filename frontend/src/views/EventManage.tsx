import { animated, useSpring } from '@react-spring/web'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Page } from '../components/Layout'
import { useToast } from '../components/Toast'
import { Button, ErrorNote, Glass, Input, LinkButton, Loading, PageHeader, StatTile, StatusBadge } from '../components/ui'
import { api } from '../lib/api'
import { formatDate, formatFull, formatTime, percent } from '../lib/format'
import { downloadPoster } from '../lib/poster'
import { CountUp } from '../lib/motion/CountUp'
import { Inview } from '../lib/motion/Inview'
import { springs, STAGGER } from '../lib/motion/config'
import type { Attendee, EventAnalytics, EventView, RegistrationStatus } from '../lib/types'

function RiskBadge({ attendee: a }: { attendee: Attendee }) {
  if (a.status === 'CHECKED_IN') return <span className="text-xs text-info">Arrived</span>
  if (a.showRate === null) return <span className="text-xs text-foreground-faint">-</span>
  const [label, tone] = a.showRate >= 0.75 ? ['Likely', 'text-accent']
    : a.showRate >= 0.55 ? ['Uncertain', 'text-warning'] : ['At risk', 'text-danger']
  const history = a.pastEvents ? `based on ${a.pastEvents} past event${a.pastEvents > 1 ? 's' : ''}` : 'no history yet - typical rate'
  return (
    <span className={`text-xs ${tone}`} title={history}>
      {label} <span className="tabular-nums text-foreground-subtle">· {percent(a.showRate)}</span>
    </span>
  )
}

function ForecastPanel({ stats, busy, onRelease }: { stats: EventAnalytics; busy: boolean; onRelease: (n: number) => void }) {
  const seated = stats.confirmed + stats.checkedIn
  const share = seated === 0 ? 0 : stats.expectedAttendance / seated
  const s = useSpring({ from: { w: 0 }, to: { w: share }, config: springs.gentle })
  return (
    <Glass className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center">
      <div>
        <p className="text-xs font-semibold uppercase tracking-eyebrow text-accent">Turnout forecast</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight">
          ~{Math.round(stats.expectedAttendance)} of {seated} expected to show up
          {stats.predictedNoShows > 0 && <span className="text-warning"> · {stats.predictedNoShows} likely no-show{stats.predictedNoShows > 1 ? 's' : ''}</span>}
        </p>
        <div className="mt-4 h-2 overflow-hidden rounded-pill bg-border-strong">
          <animated.div className="h-full origin-left rounded-pill bg-accent shadow-[0_0_12px_var(--accent)]"
            style={{ transform: s.w.to((w) => `scaleX(${w})`) }} />
        </div>
        <p className="mt-3 text-sm text-foreground-subtle">
          Each attendee's chance of turning up comes from their own check-in record at past events, blended with a
          typical 85% rate so one missed event does not count against a newcomer.
        </p>
      </div>
      {stats.suggestedExtraSeats > 0 ? (
        <div className="rounded-card border border-accent/30 bg-accent-veil p-5 md:max-w-xs">
          <p className="text-sm">
            Release <span className="font-semibold text-accent">{stats.suggestedExtraSeats}</span> predicted empty
            seat{stats.suggestedExtraSeats > 1 ? 's' : ''} to the {stats.waitlisted} on the waitlist.
          </p>
          <Button busy={busy} onClick={() => onRelease(stats.suggestedExtraSeats)} className="mt-4 w-full">
            Release {stats.suggestedExtraSeats} seat{stats.suggestedExtraSeats > 1 ? 's' : ''}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-foreground-subtle md:max-w-xs">
          {stats.releasedSeats > 0
            ? `${stats.releasedSeats} forecast seat${stats.releasedSeats > 1 ? 's were' : ' was'} already released to the waitlist.`
            : stats.waitlisted === 0 ? 'Nobody is waiting, so no seats need releasing.' : 'Turnout looks solid - no seats to release yet.'}
        </p>
      )}
    </Glass>
  )
}

const tooltipStyle = {
  contentStyle: { background: 'var(--surface-raised)', border: '1px solid var(--border-strong)', borderRadius: 12, fontSize: 12 },
  labelStyle: { color: 'var(--foreground-muted)' },
  itemStyle: { color: 'var(--foreground)' },
  cursor: { fill: 'var(--accent-veil)', stroke: 'var(--border-strong)' },
}

export function EventManage() {
  const { id } = useParams()
  const eventId = Number(id)
  const toast = useToast()
  const [event, setEvent] = useState<EventView | null>(null)
  const [stats, setStats] = useState<EventAnalytics | null>(null)
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [filter, setFilter] = useState<RegistrationStatus | 'ALL'>('ALL')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    Promise.all([api.event(eventId), api.analytics(eventId), api.attendees(eventId)])
      .then(([e, s, a]) => { setEvent(e); setStats(s); setAttendees(a) })
      .catch((e: Error) => setError(e.message))
  }, [eventId])

  useEffect(() => { load() }, [load])

  const shown = useMemo(() => attendees.filter((a) =>
    (filter === 'ALL' || a.status === filter) &&
    (!search || `${a.name} ${a.email}`.toLowerCase().includes(search.toLowerCase()))), [attendees, filter, search])

  async function cancelEvent() {
    if (!window.confirm('Cancel this event? Every registered attendee will be notified and released.')) return
    setBusy(true)
    try {
      await api.cancelEvent(eventId)
      toast('Event cancelled and attendees notified.', 'info')
      load()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const [posterBusy, setPosterBusy] = useState(false)
  async function poster() {
    if (!event) return
    setPosterBusy(true)
    try {
      await downloadPoster(event)
      toast('Poster downloaded - its QR code opens the event page.')
    } catch {
      toast('Could not create the poster.', 'error')
    } finally {
      setPosterBusy(false)
    }
  }

  async function releaseSeats(n: number) {
    if (!event) return
    setBusy(true)
    try {
      await api.releaseSeats(eventId, n)
      toast(`${n} extra seat${n > 1 ? 's' : ''} released - the waitlist has been promoted.`)
      load()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  function exportCsv() {
    const rows = [['Name', 'Email', 'Status', 'Registered', 'Checked in'],
      ...attendees.map((a) => [a.name, a.email, a.status, a.queuedAt, a.checkedInAt ?? ''])]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `attendees-${eventId}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (error) return <Page><ErrorNote message={error} /></Page>
  if (!event || !stats) return <Page><Loading shape="dashboard" /></Page>

  // JS orders numeric keys ascending, so sort explicitly: 5★ on top.
  const ratingData = Object.entries(stats.ratingDistribution)
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([star, count]) => ({ star: `${star}★`, count }))
  const series = stats.registrationsByDay.map((d) => ({ day: formatDate(d.date), count: d.count }))
  const editable = event.status !== 'CANCELLED' && new Date(event.startAt) > new Date()
  const counts: Record<RegistrationStatus | 'ALL', number> = {
    ALL: attendees.length, CONFIRMED: stats.confirmed, CHECKED_IN: stats.checkedIn, WAITLISTED: stats.waitlisted, CANCELLED: stats.cancelled,
  }

  return (
    <Page>
      <Link to="/organizer" className="tap-target inline-flex items-center text-sm text-foreground-subtle hover:text-accent">← Dashboard</Link>
      <div className="mt-6">
        <PageHeader eyebrow={formatFull(event.startAt)} title={event.title}>
          <StatusBadge status={event.status} />
          {event.status === 'APPROVED' && <LinkButton to={`/events/${event.id}`} variant="ghost">Public page</LinkButton>}
          {event.status === 'APPROVED' && <LinkButton to={`/organizer/checkin?event=${event.id}`} variant="ghost">Scan tickets</LinkButton>}
          {event.status === 'APPROVED' && <LinkButton to={`/organizer/events/${event.id}/wall`} variant="ghost">Live wall</LinkButton>}
          {event.status === 'APPROVED' && <Button variant="ghost" busy={posterBusy} onClick={poster}>Poster</Button>}
          {editable && <LinkButton to={`/organizer/events/${event.id}/edit`} variant="ghost">Edit</LinkButton>}
          {event.status !== 'CANCELLED' && <Button variant="danger" busy={busy} onClick={cancelEvent}>Cancel event</Button>}
        </PageHeader>
      </div>
      {event.status === 'REJECTED' && (
        <div className="mt-6"><ErrorNote message={`Rejected by admin: ${event.rejectionReason ?? 'no reason given'}. Edit the event to resubmit it.`} /></div>
      )}
      {event.status === 'PENDING' && (
        <p className="mt-6 rounded-control border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          Waiting for admin approval - the event is hidden from attendees until then.
        </p>
      )}

      <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Seats filled', value: <><CountUp value={stats.confirmed + stats.checkedIn} /><span className="text-lg text-foreground-subtle"> / {stats.capacity}</span></>, sub: `${percent(stats.fillRate)} full`, tone: 'accent' as const },
          { label: 'Checked in', value: <CountUp value={stats.checkedIn} />, sub: `${percent(stats.attendanceRate)} attendance`, tone: 'info' as const },
          { label: 'Waitlist', value: <CountUp value={stats.waitlisted} />, sub: `${stats.cancelled} cancelled`, tone: 'warning' as const },
          { label: 'Rating', value: stats.averageRating !== null ? <CountUp value={stats.averageRating} decimals={1} suffix=" ★" /> : '-', sub: `${stats.ratingCount} reviews`, tone: 'special' as const },
        ].map((s, i) => <Inview key={s.label} delayIn={i * STAGGER}><StatTile {...s} /></Inview>)}
      </div>

      {editable && stats.confirmed + stats.checkedIn > 0 && (
        <Inview className="mt-6">
          <ForecastPanel stats={stats} busy={busy} onRelease={releaseSeats} />
        </Inview>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Inview>
          <Glass className="p-6">
            <h2 className="text-sm font-medium text-foreground-muted">Registrations per day</h2>
            <div className="mt-4 h-60">
              {series.length === 0 ? <p className="grid h-full place-items-center text-sm text-foreground-subtle">No registrations yet.</p> : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ left: -20, right: 8, top: 8 }}>
                    <defs>
                      <linearGradient id="regFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fill: 'var(--foreground-subtle)', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fill: 'var(--foreground-subtle)', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip {...tooltipStyle} />
                    <Area type="monotone" dataKey="count" name="Sign-ups" stroke="var(--accent)" strokeWidth={2} fill="url(#regFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </Glass>
        </Inview>
        <Inview delayIn={STAGGER}>
          <Glass className="p-6">
            <h2 className="text-sm font-medium text-foreground-muted">Rating breakdown</h2>
            <div className="mt-4 h-60">
              {stats.ratingCount === 0 ? <p className="grid h-full place-items-center text-center text-sm text-foreground-subtle">Ratings open once the event starts.</p> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ratingData} layout="vertical" margin={{ left: -10, right: 8 }}>
                    <XAxis type="number" allowDecimals={false} hide />
                    <YAxis type="category" dataKey="star" tick={{ fill: 'var(--foreground-muted)', fontSize: 12 }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="count" name="Ratings" radius={[0, 6, 6, 0]} barSize={14}>
                      {ratingData.map((_, i) => <Cell key={i} fill={i < 2 ? 'var(--accent)' : 'var(--foreground-faint)'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Glass>
        </Inview>
      </div>

      <section className="mt-12" aria-labelledby="attendees-title">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h2 id="attendees-title" className="text-xl font-semibold">Attendees</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Input type="search" placeholder="Search name or email" aria-label="Search attendees" value={search}
              onChange={(e) => setSearch(e.target.value)} className="h-10 w-56! py-0!" />
            <Button variant="ghost" onClick={exportCsv} disabled={attendees.length === 0} className="h-10">Export CSV</Button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter attendees">
          {(['ALL', 'CONFIRMED', 'CHECKED_IN', 'WAITLISTED', 'CANCELLED'] as const).map((s) => (
            <button key={s} type="button" onClick={() => setFilter(s)} aria-pressed={filter === s}
              className={`cursor-pointer rounded-pill border px-3 py-1 text-xs transition duration-[var(--duration-fast)] ${
                filter === s ? 'border-accent bg-accent-veil text-accent' : 'border-border-strong text-foreground-muted hover:text-foreground'}`}>
              {s === 'ALL' ? 'All' : s.replace('_', ' ').toLowerCase()} · {counts[s]}
            </button>
          ))}
        </div>
        <Glass className="mt-4 overflow-x-auto">
          {shown.length === 0 ? <p className="p-8 text-center text-sm text-foreground-subtle">Nobody here yet.</p> : (
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-foreground-subtle">
                <tr className="border-b border-border">
                  <th className="px-5 py-3.5 font-medium">Name</th>
                  <th className="px-5 py-3.5 font-medium">Email</th>
                  <th className="px-5 py-3.5 font-medium">Registered</th>
                  <th className="px-5 py-3.5 font-medium">Status</th>
                  <th className="px-5 py-3.5 font-medium">Show-up forecast</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((a) => (
                  <tr key={a.registrationId} className="border-b border-border last:border-0">
                    <td className="px-5 py-3.5 font-medium">{a.name}</td>
                    <td className="px-5 py-3.5 text-foreground-muted">{a.email}</td>
                    <td className="px-5 py-3.5 text-foreground-subtle">{formatDate(a.queuedAt)}</td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={a.status} />
                      {a.checkedInAt && <span className="ml-2 text-xs text-foreground-subtle">{formatTime(a.checkedInAt)}</span>}
                    </td>
                    <td className="px-5 py-3.5"><RiskBadge attendee={a} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Glass>
      </section>
    </Page>
  )
}
