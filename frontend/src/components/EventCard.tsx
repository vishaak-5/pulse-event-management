import { Link } from 'react-router-dom'
import type { EventView } from '../lib/types'
import { formatDate, formatTime, relativeDay, titleCase } from '../lib/format'
import { HoverTilt } from '../lib/motion/Hover'
import { EventCover } from './EventCover'
import { SeatMeter, Stars, StatusBadge } from './ui'

export function EventCard({ event, to, showStatus = false }: { event: EventView; to?: string; showStatus?: boolean }) {
  const past = new Date(event.endAt) < new Date()
  return (
    <HoverTilt className="h-full">
      <Link
        to={to ?? `/events/${event.id}`}
        className="group relative flex h-full flex-col overflow-hidden active:scale-[0.985] rounded-panel border border-border bg-surface backdrop-blur-glass
                   transition duration-[var(--duration-normal)] hover:border-accent/40"
      >
        {/* cursor-tracking glow */}
        <span aria-hidden className="pointer-events-none absolute inset-0 z-10"
          style={{
            opacity: 'var(--spot-o, 0)',
            background: 'radial-gradient(420px circle at var(--spot-x) var(--spot-y), var(--accent-glow), transparent 45%)',
          }} />
        <div className="relative aspect-[100/52] overflow-hidden">
          <EventCover id={event.id} category={event.category} className="size-full" />
          <div className="absolute left-4 top-4 flex gap-2">
            <span className="rounded-pill border border-border-strong bg-background/60 px-2.5 py-1 text-xs font-medium uppercase tracking-wider text-foreground backdrop-blur-glass">
              {titleCase(event.category)}
            </span>
            {showStatus && <StatusBadge status={event.status} />}
          </div>
          <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-wider text-accent">{past ? 'Ended' : relativeDay(event.startAt)}</p>
              <p className="text-sm font-medium text-foreground">{formatDate(event.startAt)} · {formatTime(event.startAt)}</p>
            </div>
            {event.ratingCount > 0 && event.averageRating !== null && (
              <span className="flex items-center gap-1 text-xs text-foreground-muted">
                <Stars value={event.averageRating} size={12} /> {event.averageRating.toFixed(1)}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-4 p-5">
          <div className="flex-1">
            <h3 className="text-lg font-semibold leading-snug tracking-tight transition duration-[var(--duration-fast)] group-hover:text-accent">
              {event.title}
            </h3>
            <p className="mt-1 text-sm text-foreground-subtle">{event.venue} · by {event.organizerName}</p>
          </div>
          <SeatMeter taken={event.seatsTaken} capacity={event.capacity} />
        </div>
      </Link>
    </HoverTilt>
  )
}
