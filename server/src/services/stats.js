import Event, { EVENT_STATUSES } from '../models/event.js'
import Feedback from '../models/feedback.js'
import Registration, { SEAT_HOLDING } from '../models/registration.js'
import User, { ROLES } from '../models/user.js'
import { toLocalDay } from '../lib/time.js'
import { findEvent, requireManage } from './events.js'
import { estimateShowRates } from './forecast.js'
import { holdsSeat } from './views.js'

const nextDay = (day) => {
  const d = new Date(`${day}T12:00:00`)
  d.setDate(d.getDate() + 1)
  return toLocalDay(d)
}

/** Analytics for one event, shown on the organizer dashboard. */
export async function eventAnalytics(eventId, actor) {
  const e = await findEvent(eventId)
  requireManage(e, actor)
  const regs = await Registration.find({ event: eventId }).lean()
  const count = (s) => regs.filter((r) => r.status === s).length
  const confirmed = count('CONFIRMED')
  const checkedIn = count('CHECKED_IN')
  const waitlisted = count('WAITLISTED')
  const cancelled = count('CANCELLED')
  const seated = confirmed + checkedIn

  // Daily sign-ups from the first registration up to today (or the event day), zero-filled.
  const byDay = new Map()
  for (const r of regs) {
    const day = toLocalDay(r.createdAt)
    byDay.set(day, (byDay.get(day) ?? 0) + 1)
  }
  const registrationsByDay = []
  if (byDay.size) {
    const days = [...byDay.keys()].sort()
    const today = toLocalDay(new Date())
    const eventDay = toLocalDay(e.startAt)
    let end = today < eventDay ? today : eventDay
    if (end < days.at(-1)) end = days.at(-1)
    for (let d = days[0]; d <= end; d = nextDay(d)) registrationsByDay.push({ date: d, count: byDay.get(d) ?? 0 })
  }

  const ratings = await Feedback.find({ event: eventId }, { rating: 1 }).lean()
  const ratingDistribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  for (const f of ratings) ratingDistribution[f.rating] += 1
  const averageRating = ratings.length ? ratings.reduce((s, f) => s + f.rating, 0) / ratings.length : null

  // Turnout forecast: people already checked in count fully, the rest by their show-up estimate.
  const holders = regs.filter(holdsSeat)
  const estimates = await estimateShowRates(e._id, holders.map((r) => r.user))
  const expected = holders.reduce((s, r) => s + (r.status === 'CHECKED_IN' ? 1 : estimates.get(r.user).showRate), 0)
  const noShows = Math.round(seated - expected)
  // Only suggest releasing seats while that can still help someone on the waitlist.
  const upcoming = e.status === 'APPROVED' && e.startAt > new Date()
  const extraSeats = upcoming && e.releasedSeats === 0 ? Math.min(Math.floor(seated - expected), waitlisted) : 0

  return {
    eventId: e._id,
    title: e.title,
    capacity: e.capacity,
    confirmed,
    checkedIn,
    waitlisted,
    cancelled,
    fillRate: e.capacity ? seated / e.capacity : 0,
    attendanceRate: seated ? checkedIn / seated : 0,
    averageRating,
    ratingCount: ratings.length,
    ratingDistribution,
    registrationsByDay,
    expectedAttendance: expected,
    predictedNoShows: Math.max(0, noShows),
    suggestedExtraSeats: Math.max(0, extraSeats),
    releasedSeats: e.releasedSeats,
  }
}

/** Totals across all of an organizer's events. */
export async function organizerOverview(user) {
  const mine = await Event.find({ organizer: user.id }).lean()
  const ids = mine.map((e) => e._id)
  const now = new Date()
  const [totalRegistrations, totalCheckedIn, rating] = await Promise.all([
    Registration.countDocuments({ event: { $in: ids }, status: { $in: SEAT_HOLDING } }),
    Registration.countDocuments({ event: { $in: ids }, status: 'CHECKED_IN' }),
    Feedback.aggregate([{ $match: { event: { $in: ids } } }, { $group: { _id: null, avg: { $avg: '$rating' } } }]),
  ])
  return {
    totalEvents: mine.length,
    upcomingEvents: mine.filter((e) => e.status === 'APPROVED' && e.endAt > now).length,
    pendingApproval: mine.filter((e) => e.status === 'PENDING').length,
    totalRegistrations,
    totalCheckedIn,
    averageRating: rating[0]?.avg ?? null,
  }
}

/** Counts per value of `field`, with every allowed value present (zero if none). */
async function countByField(Model, field, values) {
  const rows = await Model.aggregate([{ $group: { _id: `$${field}`, n: { $sum: 1 } } }])
  const found = new Map(rows.map((r) => [r._id, r.n]))
  return Object.fromEntries(values.map((v) => [v, found.get(v) ?? 0]))
}

export async function adminStats() {
  const [usersByRole, eventsByStatus, activeRegistrations, checkIns] = await Promise.all([
    countByField(User, 'role', ROLES),
    countByField(Event, 'status', EVENT_STATUSES),
    Registration.countDocuments({ status: { $in: SEAT_HOLDING } }),
    Registration.countDocuments({ status: 'CHECKED_IN' }),
  ])
  return { usersByRole, eventsByStatus, activeRegistrations, checkIns }
}

export async function publicStats() {
  const [upcomingEvents, attendees, organizers, ticketsIssued] = await Promise.all([
    Event.countDocuments({ status: 'APPROVED', endAt: { $gt: new Date() } }),
    User.countDocuments({ role: 'ATTENDEE' }),
    User.countDocuments({ role: 'ORGANIZER' }),
    Registration.countDocuments({ status: { $in: SEAT_HOLDING } }),
  ])
  return { upcomingEvents, attendees, organizers, ticketsIssued }
}
