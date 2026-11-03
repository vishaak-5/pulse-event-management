import type { EventView } from './types'

/** Local wall-clock ISO ("2026-11-04T09:00:00") -> iCalendar UTC stamp ("20261104T033000Z"). */
function icsStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => `\\${m}`)
}

export function eventUrl(e: EventView): string {
  return `${window.location.origin}/events/${e.id}`
}

/** Downloads an .ics file that every calendar app (Google, Outlook, Apple) can import. */
export function downloadIcs(e: EventView): void {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pulse//Smart Event Management//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:pulse-event-${e.id}@pulse.local`,
    `DTSTAMP:${icsStamp(new Date().toISOString())}`,
    `DTSTART:${icsStamp(e.startAt)}`,
    `DTEND:${icsStamp(e.endAt)}`,
    `SUMMARY:${icsEscape(e.title)}`,
    `LOCATION:${icsEscape(e.venue)}`,
    `DESCRIPTION:${icsEscape(`${e.description}\n\n${eventUrl(e)}`)}`,
    `URL:${eventUrl(e)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(e.title)} starts in 1 hour`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ]
  const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${e.title.replace(/[^\w\s-]/g, '').trim() || 'event'}.ics`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function googleCalendarUrl(e: EventView): string {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${icsStamp(e.startAt)}/${icsStamp(e.endAt)}`,
    location: e.venue,
    details: `${e.description}\n\n${eventUrl(e)}`,
  })
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}

/** Native share sheet on phones; copies the link elsewhere. Returns what happened. */
export async function shareEvent(e: EventView): Promise<'shared' | 'copied' | 'cancelled'> {
  const url = eventUrl(e)
  if (navigator.share) {
    try {
      await navigator.share({ title: e.title, text: `${e.title} · ${e.venue}`, url })
      return 'shared'
    } catch {
      return 'cancelled'
    }
  }
  await navigator.clipboard.writeText(url)
  return 'copied'
}
