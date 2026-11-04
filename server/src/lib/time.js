// Dates travel as local wall-clock strings ("2026-11-04T09:00:00"), the format the
// React app sends and reads. The process time zone is Asia/Kolkata (see config.js).

const pad = (n) => String(n).padStart(2, '0')

/** Date -> "YYYY-MM-DDTHH:mm:ss" in local time, or null. */
export function toLocal(d) {
  if (!d) return null
  const x = d instanceof Date ? d : new Date(d)
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}:${pad(x.getSeconds())}`
}

/** Date -> "YYYY-MM-DD" in local time. */
export function toLocalDay(d) {
  return toLocal(d).slice(0, 10)
}

/** "YYYY-MM-DDTHH:mm[:ss]" (no zone) -> Date in local time. */
export function parseLocal(s) {
  return new Date(s)
}

export const hoursFromNow = (h) => new Date(Date.now() + h * 3_600_000)

const WHEN = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
})

/** Human-readable date for emails and messages: "Wed, 4 Nov 2026, 9:00 am". */
export const when = (d) => WHEN.format(d)
