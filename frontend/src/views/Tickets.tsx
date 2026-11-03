import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EventCover } from '../components/EventCover'
import { Page } from '../components/Layout'
import { useToast } from '../components/Toast'
import { Button, Empty, ErrorNote, Glass, LinkButton, Loading, PageHeader, Spinner, StatusBadge } from '../components/ui'
import { api, downloadCertificate, fetchQrUrl } from '../lib/api'
import { formatRange, relativeDay } from '../lib/format'
import { Inview } from '../lib/motion/Inview'
import { STAGGER } from '../lib/motion/config'
import type { Ticket } from '../lib/types'

export function Tickets() {
  const [tickets, setTickets] = useState<Ticket[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => { api.myTickets().then(setTickets).catch((e: Error) => setError(e.message)) }, [])

  const now = new Date()
  const upcoming = tickets?.filter((t) => t.status !== 'CANCELLED' && new Date(t.endAt) > now) ?? []
  const past = tickets?.filter((t) => t.status !== 'CANCELLED' && new Date(t.endAt) <= now) ?? []
  const cancelled = tickets?.filter((t) => t.status === 'CANCELLED') ?? []

  return (
    <Page>
      <PageHeader eyebrow="Your wallet" title="My" accent="tickets.">
        <LinkButton to="/events" variant="ghost">Find more events</LinkButton>
      </PageHeader>
      <div className="mt-10">
        {error && <ErrorNote message={error} />}
        {!error && !tickets && <Loading shape="cards" />}
        {tickets?.length === 0 && (
          <Empty title="No tickets yet">Register for an event and your QR ticket will appear here.</Empty>
        )}
        {upcoming.length > 0 && (
          <ul className="grid gap-6 md:grid-cols-2">
            {upcoming.map((t, i) => <Inview key={t.id} tag="li" delayIn={i * STAGGER}><TicketCard ticket={t} /></Inview>)}
          </ul>
        )}
        {past.length > 0 && (
          <section className="mt-16">
            <h2 className="text-xl font-semibold">Past events</h2>
            <ul className="mt-5 flex flex-col gap-3">
              {past.map((t) => (
                <li key={t.id}>
                  <Glass className="flex flex-wrap items-center justify-between gap-4 p-4 transition duration-[var(--duration-fast)] hover:border-accent/40">
                    <Link to={`/events/${t.eventId}`} className="group">
                      <p className="font-medium group-hover:text-accent">{t.eventTitle}</p>
                      <p className="text-sm text-foreground-subtle">{formatRange(t.startAt, t.endAt)}</p>
                    </Link>
                    <div className="flex items-center gap-3">
                      {!t.feedbackGiven && t.status !== 'WAITLISTED' && (
                        <Link to={`/events/${t.eventId}`} className="text-xs text-accent hover:underline">Rate it →</Link>
                      )}
                      {t.status === 'CHECKED_IN' && <CertificateButton ticket={t} />}
                      <StatusBadge status={t.status} />
                    </div>
                  </Glass>
                </li>
              ))}
            </ul>
          </section>
        )}
        {cancelled.length > 0 && (
          <p className="mt-10 text-sm text-foreground-faint">{cancelled.length} cancelled registration{cancelled.length > 1 ? 's' : ''} hidden.</p>
        )}
      </div>
    </Page>
  )
}

function CertificateButton({ ticket }: { ticket: Ticket }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  async function download() {
    setBusy(true)
    try {
      await downloadCertificate(ticket.id, ticket.eventTitle)
      toast('Certificate downloaded. Its QR code links to a public verification page.')
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button variant="ghost" busy={busy} onClick={download} className="h-9 px-3.5 text-xs">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="12" cy="9" r="5" /><path d="m9 13.5-1.5 7.5 4.5-2.5 4.5 2.5L15 13.5" strokeLinejoin="round" />
      </svg>
      Certificate
    </Button>
  )
}

function TicketCard({ ticket }: { ticket: Ticket }) {
  const [qr, setQr] = useState<string | null>(null)
  const hasSeat = ticket.status === 'CONFIRMED' || ticket.status === 'CHECKED_IN'

  useEffect(() => {
    if (!hasSeat) return
    let url: string | null = null
    fetchQrUrl(ticket.id).then((u) => { url = u; setQr(u) }).catch(() => setQr(null))
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [ticket.id, hasSeat])

  return (
    <Glass tag="article" className="overflow-hidden">
      <div className="relative h-28">
        <EventCover id={ticket.eventId} category={ticket.category} className="size-full" />
        <div className="absolute bottom-3 left-5 right-5 flex items-end justify-between">
          <p className="font-mono text-xs uppercase tracking-wider text-accent">{relativeDay(ticket.startAt)}</p>
          <StatusBadge status={ticket.status} />
        </div>
      </div>
      {/* perforation */}
      <div aria-hidden className="relative h-0 border-t border-dashed border-border-strong">
        <span className="absolute -left-3 -top-3 size-6 rounded-full bg-background" />
        <span className="absolute -right-3 -top-3 size-6 rounded-full bg-background" />
      </div>
      <div className="flex gap-5 p-5">
        <div className="flex-1">
          <Link to={`/events/${ticket.eventId}`} className="text-lg font-semibold leading-snug hover:text-accent">{ticket.eventTitle}</Link>
          <p className="mt-1 text-sm text-foreground-muted">{formatRange(ticket.startAt, ticket.endAt)}</p>
          <p className="text-sm text-foreground-subtle">{ticket.venue}</p>
          {ticket.status === 'WAITLISTED' && (
            <p className="mt-4 text-sm text-warning">#{ticket.waitlistPosition} on the waitlist - you'll be confirmed automatically.</p>
          )}
          {ticket.ticketCode && (
            <p className="mt-4 font-mono text-xs uppercase tracking-wider text-foreground-faint">{ticket.ticketCode.slice(0, 18)}…</p>
          )}
        </div>
        {hasSeat && (
          <div className="grid size-32 shrink-0 place-items-center rounded-card bg-foreground p-2">
            {qr ? <img src={qr} alt={`QR ticket for ${ticket.eventTitle}`} className="size-full" /> : <span className="text-background"><Spinner /></span>}
          </div>
        )}
      </div>
    </Glass>
  )
}
