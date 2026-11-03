import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Page } from '../components/Layout'
import { useToast } from '../components/Toast'
import { Button, Empty, ErrorNote, Glass, Input, Loading, PageHeader, Select, StatTile, StatusBadge } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatDate, formatTime, titleCase } from '../lib/format'
import { CountUp } from '../lib/motion/CountUp'
import { Inview } from '../lib/motion/Inview'
import { STAGGER } from '../lib/motion/config'
import type { AdminStats, EventStatus, EventView, Role, User } from '../lib/types'

type Tab = 'approvals' | 'events' | 'users'

export function AdminDashboard() {
  const [tab, setTab] = useState<Tab>('approvals')
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [error, setError] = useState('')

  const loadStats = useCallback(() => { api.adminStats().then(setStats).catch((e: Error) => setError(e.message)) }, [])
  useEffect(() => { loadStats() }, [loadStats])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'approvals', label: `Approvals${stats?.eventsByStatus.PENDING ? ` · ${stats.eventsByStatus.PENDING}` : ''}` },
    { id: 'events', label: 'All events' },
    { id: 'users', label: 'Users' },
  ]

  return (
    <Page>
      <PageHeader eyebrow="Administration" title="Platform" accent="control." />
      {error && <div className="mt-8"><ErrorNote message={error} /></div>}
      {stats && (
        <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: 'Users', value: <CountUp value={Object.values(stats.usersByRole).reduce((a, b) => a + b, 0)} />, sub: `${stats.usersByRole.ORGANIZER} organizers · ${stats.usersByRole.ATTENDEE} attendees`, tone: 'accent' as const },
            { label: 'Live events', value: <CountUp value={stats.eventsByStatus.APPROVED} />, sub: `${stats.eventsByStatus.CANCELLED} cancelled`, tone: 'info' as const },
            { label: 'Pending review', value: <CountUp value={stats.eventsByStatus.PENDING} />, sub: `${stats.eventsByStatus.REJECTED} rejected`, tone: 'warning' as const },
            { label: 'Active tickets', value: <CountUp value={stats.activeRegistrations} />, sub: `${stats.checkIns} checked in`, tone: 'special' as const },
          ].map((s, i) => <Inview key={s.label} delayIn={i * STAGGER}><StatTile {...s} /></Inview>)}
        </div>
      )}

      <div className="mt-12 flex gap-1 border-b border-border" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`-mb-px cursor-pointer border-b-2 px-4 py-3 text-sm transition duration-[var(--duration-fast)] ${
              tab === t.id ? 'border-accent text-accent' : 'border-transparent text-foreground-muted hover:text-foreground'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {tab === 'approvals' && <Approvals onChange={loadStats} />}
        {tab === 'events' && <AllEvents />}
        {tab === 'users' && <Users onChange={loadStats} />}
      </div>
    </Page>
  )
}

function Approvals({ onChange }: { onChange: () => void }) {
  const toast = useToast()
  const [events, setEvents] = useState<EventView[] | null>(null)
  const [rejecting, setRejecting] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)

  const load = useCallback(() => { api.adminEvents('PENDING').then(setEvents).catch(() => setEvents([])) }, [])
  useEffect(() => { load() }, [load])

  async function act(id: number, approve: boolean) {
    if (busyId !== null) return // a second tap while the first is in flight does nothing
    setBusyId(id)
    try {
      if (approve) await api.approve(id)
      else await api.reject(id, reason)
      toast(approve ? 'Event approved - it is now live.' : 'Event sent back to the organizer.', approve ? 'success' : 'info')
      setRejecting(null)
      setReason('')
      load()
      onChange()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusyId(null)
    }
  }

  if (!events) return <Loading shape="table" />
  if (events.length === 0) return <Empty title="All caught up">No events are waiting for review.</Empty>
  return (
    <ul className="flex flex-col gap-4">
      {events.map((e) => (
        <li key={e.id}>
          <Glass className="p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="max-w-2xl">
                <p className="text-xs uppercase tracking-wider text-foreground-subtle">{titleCase(e.category)} · by {e.organizerName}</p>
                <Link to={`/organizer/events/${e.id}`} className="mt-1 block text-lg font-semibold hover:text-accent">{e.title}</Link>
                <p className="mt-1 text-sm text-foreground-muted">{formatDate(e.startAt)} · {formatTime(e.startAt)} · {e.venue} · {e.capacity} seats</p>
                <p className="mt-3 line-clamp-3 text-sm text-foreground-subtle">{e.description}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="danger" disabled={busyId === e.id} onClick={() => setRejecting(rejecting === e.id ? null : e.id)}>Reject</Button>
                <Button busy={busyId === e.id && rejecting !== e.id} disabled={busyId !== null} onClick={() => act(e.id, true)}>Approve</Button>
              </div>
            </div>
            {rejecting === e.id && (
              <form className="mt-5 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row"
                onSubmit={(ev) => { ev.preventDefault(); act(e.id, false) }}>
                <Input autoFocus placeholder="Reason for the organizer (optional)" maxLength={300} value={reason} onChange={(ev) => setReason(ev.target.value)} />
                <Button type="submit" variant="danger" busy={busyId === e.id}>Send back</Button>
              </form>
            )}
          </Glass>
        </li>
      ))}
    </ul>
  )
}

function AllEvents() {
  const [status, setStatus] = useState<EventStatus | ''>('')
  const [events, setEvents] = useState<EventView[] | null>(null)
  useEffect(() => { setEvents(null); api.adminEvents(status || undefined).then(setEvents).catch(() => setEvents([])) }, [status])

  return (
    <>
      <Select value={status} onChange={(e) => setStatus(e.target.value as EventStatus | '')} className="mb-4 w-52" aria-label="Filter by status">
        <option value="">All statuses</option>
        {(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const).map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
      </Select>
      {!events ? <Loading shape="table" /> : events.length === 0 ? <Empty title="No events" /> : (
        <Glass className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-foreground-subtle">
              <tr className="border-b border-border">
                <th className="px-5 py-3.5 font-medium">Event</th>
                <th className="px-5 py-3.5 font-medium">Organizer</th>
                <th className="px-5 py-3.5 font-medium">Date</th>
                <th className="px-5 py-3.5 font-medium">Seats</th>
                <th className="px-5 py-3.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3.5"><Link to={`/organizer/events/${e.id}`} className="font-medium hover:text-accent">{e.title}</Link></td>
                  <td className="px-5 py-3.5 text-foreground-muted">{e.organizerName}</td>
                  <td className="px-5 py-3.5 text-foreground-muted">{formatDate(e.startAt)}</td>
                  <td className="px-5 py-3.5 tabular-nums">{e.seatsTaken} / {e.capacity}</td>
                  <td className="px-5 py-3.5"><StatusBadge status={e.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Glass>
      )}
    </>
  )
}

function Users({ onChange }: { onChange: () => void }) {
  const { user: me } = useAuth()
  const toast = useToast()
  const [users, setUsers] = useState<User[] | null>(null)
  const [search, setSearch] = useState('')
  useEffect(() => { api.users().then(setUsers).catch(() => setUsers([])) }, [])

  const [busyUser, setBusyUser] = useState<number | null>(null)

  async function update(u: User, patch: { enabled?: boolean; role?: Role }) {
    if (busyUser !== null) return
    setBusyUser(u.id)
    try {
      const updated = await api.updateUser(u.id, patch)
      setUsers((xs) => xs?.map((x) => (x.id === u.id ? updated : x)) ?? null)
      toast(`${updated.name} updated.`)
      onChange()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusyUser(null)
    }
  }

  if (!users) return <Loading shape="table" />
  const shown = users.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(search.toLowerCase()))
  return (
    <>
      <Input type="search" placeholder="Search users" aria-label="Search users" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-4 max-w-xs" />
      <Glass className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-foreground-subtle">
            <tr className="border-b border-border">
              <th className="px-5 py-3.5 font-medium">Name</th>
              <th className="px-5 py-3.5 font-medium">Email</th>
              <th className="px-5 py-3.5 font-medium">Joined</th>
              <th className="px-5 py-3.5 font-medium">Role</th>
              <th className="px-5 py-3.5 font-medium">Access</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => {
              const self = u.id === me?.id
              return (
                <tr key={u.id} className={`border-b border-border last:border-0 ${u.enabled ? '' : 'opacity-50'}`}>
                  <td className="px-5 py-3 font-medium">{u.name}{self && <span className="ml-2 text-xs text-accent">you</span>}</td>
                  <td className="px-5 py-3 text-foreground-muted">{u.email}</td>
                  <td className="px-5 py-3 text-foreground-subtle">{formatDate(u.createdAt)}</td>
                  <td className="px-5 py-3">
                    <Select value={u.role} disabled={self || busyUser === u.id} aria-label={`Role for ${u.name}`}
                      onChange={(e) => update(u, { role: e.target.value as Role })} className="h-9 w-36 py-0!">
                      {(['ATTENDEE', 'ORGANIZER', 'ADMIN'] as const).map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}
                    </Select>
                  </td>
                  <td className="px-5 py-3">
                    {!self && (
                      <Button variant={u.enabled ? 'danger' : 'ghost'} className="h-9 px-3.5 text-xs" busy={busyUser === u.id} onClick={() => update(u, { enabled: !u.enabled })}>
                        {u.enabled ? 'Disable' : 'Enable'}
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Glass>
    </>
  )
}
