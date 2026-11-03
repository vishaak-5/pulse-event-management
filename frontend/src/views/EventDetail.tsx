import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EventCover } from '../components/EventCover'
import { Page } from '../components/Layout'
import { useToast } from '../components/Toast'
import { Button, ErrorNote, Eyebrow, Glass, LinkButton, Loading, SeatMeter, Stars, StatusBadge, Textarea } from '../components/ui'
import { api, streamSeats } from '../lib/api'
import { useAuth } from '../lib/auth'
import { downloadIcs, googleCalendarUrl, shareEvent } from '../lib/share'
import { formatDate, formatFull, formatTime, relativeDay, titleCase } from '../lib/format'
import { Inview } from '../lib/motion/Inview'
import type { EventView, Feedback, Ticket } from '../lib/types'

export function EventDetail() {
  const { id } = useParams()
  const eventId = Number(id)
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [event, setEvent] = useState<EventView | null>(null)
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [feedback, setFeedback] = useState<Feedback[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const e = await api.event(eventId)
      setEvent(e)
      if (e.status === 'APPROVED') api.eventFeedback(eventId).then(setFeedback).catch(() => {})
      if (user?.role === 'ATTENDEE') setTicket((await api.myTicketFor(eventId)) ?? null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [eventId, user])

  useEffect(() => { load() }, [load])

  // Live seat counts: other people's registrations update this page in real time.
  const [live, setLive] = useState(false)
  const approved = event?.status === 'APPROVED'
  useEffect(() => {
    if (!approved) return
    const ctrl = new AbortController()
    setLive(true)
    streamSeats(eventId, (s) => setEvent((e) => e && ({
      ...e, capacity: s.capacity, seatsTaken: s.seatsTaken, seatsLeft: s.seatsLeft, waitlistCount: s.waitlistCount,
      registrationsLast24h: s.registrationsLast24h,
    })), ctrl.signal).catch(() => {}).finally(() => { if (!ctrl.signal.aborted) setLive(false) })
    return () => ctrl.abort()
  }, [eventId, approved])

  async function share() {
    if (!event) return
    try {
      const r = await shareEvent(event)
      if (r === 'copied') toast('Event link copied to the clipboard.', 'info')
    } catch {
      toast('Could not share this event.', 'error')
    }
  }

  async function register() {
    if (!user) {
      navigate('/login', { state: { from: `/events/${eventId}` } })
      return
    }
    setBusy(true)
    try {
      const t = await api.registerFor(eventId)
      toast(t.status === 'CONFIRMED' ? "You're in! Your QR ticket is ready." : `Event is full - you're #${t.waitlistPosition} on the waitlist.`,
        t.status === 'CONFIRMED' ? 'success' : 'info')
      await load()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function cancel() {
    if (!window.confirm('Cancel your registration? Your seat will go to the next person on the waitlist.')) return
    setBusy(true)
    try {
      await api.cancelRegistration(eventId)
      toast('Registration cancelled.', 'info')
      await load()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  if (error) return <Page><ErrorNote message={error} /></Page>
  if (!event) return <Page><Loading shape="detail" /></Page>

  const started = new Date(event.startAt) <= new Date()
  const ended = new Date(event.endAt) <= new Date()
  const active = ticket && ticket.status !== 'CANCELLED'
  const canManage = user && (user.role === 'ADMIN' || user.id === event.organizerId)

  return (
    <Page>
      <Link to="/events" className="tap-target inline-flex items-center text-sm text-foreground-subtle transition duration-[var(--duration-fast)] hover:text-accent">← All events</Link>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div>
          <Inview blur>
            <div className="relative overflow-hidden rounded-panel border border-border">
              <EventCover id={event.id} category={event.category} className="aspect-[100/42] w-full" />
              <div className="absolute bottom-5 left-6 right-6">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-pill border border-border-strong bg-background/60 px-2.5 py-1 text-xs font-medium uppercase tracking-wider backdrop-blur-glass">
                    {titleCase(event.category)}
                  </span>
                  {event.status !== 'APPROVED' && <StatusBadge status={event.status} />}
                </div>
                <h1 className="mt-3 text-3xl font-semibold leading-display tracking-tight md:text-5xl">{event.title}</h1>
              </div>
            </div>
          </Inview>

          <Inview delayIn={80} className="mt-10">
            <Eyebrow>About this event</Eyebrow>
            <p className="mt-4 whitespace-pre-line text-base leading-relaxed text-foreground-muted">{event.description}</p>
            <p className="mt-6 text-sm text-foreground-subtle">Hosted by <span className="text-foreground">{event.organizerName}</span></p>
          </Inview>

          {event.status === 'APPROVED' && (
            <Inview delayIn={120} className="mt-12">
              <div className="flex items-end justify-between">
                <div>
                  <Eyebrow>Reviews</Eyebrow>
                  <h2 className="mt-3 text-2xl font-semibold">
                    {event.ratingCount > 0 && event.averageRating !== null
                      ? <>{event.averageRating.toFixed(1)} <span className="text-base font-normal text-foreground-subtle">from {event.ratingCount} rating{event.ratingCount > 1 ? 's' : ''}</span></>
                      : 'No reviews yet'}
                  </h2>
                </div>
                {event.averageRating !== null && <Stars value={event.averageRating} size={18} />}
              </div>
              {ticket && ticket.status !== 'CANCELLED' && ticket.status !== 'WAITLISTED' && started && (
                <FeedbackForm eventId={event.id} given={ticket.feedbackGiven} onDone={load} />
              )}
              <ul className="mt-6 flex flex-col gap-3">
                {feedback.map((f) => (
                  <li key={f.id}>
                    <Glass className="p-5">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{f.userName}</p>
                        <Stars value={f.rating} size={13} />
                      </div>
                      {f.comment && <p className="mt-2 text-sm text-foreground-muted">{f.comment}</p>}
                    </Glass>
                  </li>
                ))}
              </ul>
            </Inview>
          )}
        </div>

        {/* booking panel */}
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <Inview delayIn={60}>
            <Glass className="p-6">
              <dl className="flex flex-col gap-4 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wider text-foreground-subtle">When</dt>
                  <dd className="mt-1 font-medium">{formatFull(event.startAt)}</dd>
                  <dd className="text-foreground-subtle">
                    until {new Date(event.endAt).toDateString() === new Date(event.startAt).toDateString()
                      ? formatTime(event.endAt) : `${formatDate(event.endAt)}, ${formatTime(event.endAt)}`}
                    {' · '}{ended ? 'Ended' : relativeDay(event.startAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-foreground-subtle">Where</dt>
                  <dd className="mt-1 font-medium">{event.venue}</dd>
                </div>
              </dl>
              <div className="my-6 h-px bg-border" />
              <SeatMeter taken={event.seatsTaken} capacity={event.capacity} />
              {event.waitlistCount > 0 && (
                <p className="mt-2 text-xs text-warning">{event.waitlistCount} on the waitlist</p>
              )}
              {(live || event.registrationsLast24h > 0) && !ended && (
                <p className="mt-3 flex items-center gap-2 text-xs text-foreground-muted">
                  {live && <span className="size-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" aria-hidden />}
                  {live && <span className="font-semibold uppercase tracking-wider text-accent">Live</span>}
                  {event.registrationsLast24h > 0 && (
                    <span>{event.registrationsLast24h} registration{event.registrationsLast24h > 1 ? 's' : ''} in the last 24 hours</span>
                  )}
                </p>
              )}

              <div className="mt-6 flex flex-col gap-3">
                {canManage ? (
                  <LinkButton to={`/organizer/events/${event.id}`}>Manage event</LinkButton>
                ) : user && user.role !== 'ATTENDEE' ? (
                  <p className="text-sm text-foreground-subtle">Sign in with an attendee account to register.</p>
                ) : ended || event.status !== 'APPROVED' ? (
                  <p className="text-sm text-foreground-subtle">Registration is closed.</p>
                ) : active ? (
                  <>
                    <div className="flex items-center justify-between rounded-card border border-border-strong px-4 py-3">
                      <span className="text-sm">Your registration</span>
                      <StatusBadge status={ticket.status} />
                    </div>
                    {ticket.status === 'WAITLISTED' && (
                      <p className="text-sm text-foreground-muted">You're <span className="text-warning">#{ticket.waitlistPosition}</span> in line. We'll confirm you automatically.</p>
                    )}
                    {ticket.status !== 'WAITLISTED' && <LinkButton to="/tickets">View QR ticket</LinkButton>}
                    {ticket.status !== 'CHECKED_IN' && (
                      <Button variant="danger" busy={busy} onClick={cancel}>Cancel registration</Button>
                    )}
                  </>
                ) : (
                  <Button busy={busy} onClick={register} className="h-12">
                    {event.seatsLeft > 0 ? 'Register - free' : 'Join the waitlist'}
                  </Button>
                )}
              </div>
              {event.status === 'APPROVED' && (
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-4">
                  {!ended && (
                    <button type="button" onClick={() => downloadIcs(event)} className={chip}
                      title="Download an .ics file for Outlook, Apple or any calendar app">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
                      </svg>
                      .ics
                    </button>
                  )}
                  {!ended && (
                    <a href={googleCalendarUrl(event)} target="_blank" rel="noreferrer" className={chip}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                      </svg>
                      Google
                    </a>
                  )}
                  <button type="button" onClick={share} className={`${chip} ${ended ? 'col-span-3' : ''}`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" />
                      <path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4" />
                    </svg>
                    Share
                  </button>
                </div>
              )}
            </Glass>
          </Inview>
        </aside>
      </div>
    </Page>
  )
}

const chip = 'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-pill border border-border-strong px-3 py-2 ' +
  'text-xs font-medium text-foreground-muted transition duration-[var(--duration-fast)] hover:border-accent hover:text-accent'

function FeedbackForm({ eventId, given, onDone }: { eventId: number; given: boolean; onDone: () => void }) {
  const toast = useToast()
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (rating === 0) {
      toast('Pick a star rating first.', 'error')
      return
    }
    setBusy(true)
    try {
      await api.submitFeedback(eventId, rating, comment)
      toast('Thanks for the feedback!')
      setComment('')
      onDone()
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Glass tag="form" className="mt-6 flex flex-col gap-4 p-5">
      <p className="text-sm font-medium">{given ? 'Update your rating' : 'How was it?'}</p>
      <Stars value={rating} size={26} onChange={setRating} />
      <Textarea placeholder="Optional - what stood out?" value={comment} onChange={(e) => setComment(e.target.value)}
        maxLength={1000} className="min-h-20" aria-label="Comment" />
      <Button type="submit" busy={busy} onClick={submit} className="self-start">Submit rating</Button>
    </Glass>
  )
}
