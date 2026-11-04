// Shapes documents into the JSON the React app reads (see frontend/src/lib/types.ts).
// List endpoints build their extra numbers with one aggregation per collection,
// not one query per event.
import Event from '../models/event.js'
import Feedback from '../models/feedback.js'
import Registration, { SEAT_HOLDING } from '../models/registration.js'
import User from '../models/user.js'
import { toLocal } from '../lib/time.js'

export const holdsSeat = (r) => SEAT_HOLDING.includes(r.status)

export const userView = (u) => ({
  id: u._id, name: u.name, email: u.email, role: u.role, enabled: u.enabled, createdAt: toLocal(u.createdAt),
})

export const feedbackView = (f, userName) => ({
  id: f._id, userName, rating: f.rating, comment: f.comment ?? null, createdAt: toLocal(f.createdAt),
})

/** Event documents -> EventView[], in the same order. */
export async function eventViews(events) {
  if (!events.length) return []
  const ids = events.map((e) => e._id)
  const since = new Date(Date.now() - 24 * 3_600_000)
  const [regStats, ratings, organizers] = await Promise.all([
    Registration.aggregate([
      { $match: { event: { $in: ids } } },
      {
        $group: {
          _id: '$event',
          waitlist: { $sum: { $cond: [{ $eq: ['$status', 'WAITLISTED'] }, 1, 0] } },
          recent: { $sum: { $cond: [{ $gt: ['$createdAt', since] }, 1, 0] } },
        },
      },
    ]),
    Feedback.aggregate([
      { $match: { event: { $in: ids } } },
      { $group: { _id: '$event', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]),
    User.find({ _id: { $in: [...new Set(events.map((e) => e.organizer))] } }, { name: 1 }).lean(),
  ])
  const regBy = new Map(regStats.map((r) => [r._id, r]))
  const rateBy = new Map(ratings.map((r) => [r._id, r]))
  const nameBy = new Map(organizers.map((u) => [u._id, u.name]))

  return events.map((e) => {
    const reg = regBy.get(e._id)
    const rating = rateBy.get(e._id)
    return {
      id: e._id,
      title: e.title,
      description: e.description,
      category: e.category,
      venue: e.venue,
      startAt: toLocal(e.startAt),
      endAt: toLocal(e.endAt),
      capacity: e.capacity,
      seatsTaken: e.seatsTaken,
      seatsLeft: Math.max(0, e.capacity - e.seatsTaken),
      waitlistCount: reg?.waitlist ?? 0,
      status: e.status,
      rejectionReason: e.rejectionReason ?? null,
      organizerId: e.organizer,
      organizerName: nameBy.get(e.organizer) ?? 'Unknown',
      averageRating: rating ? rating.avg : null,
      ratingCount: rating?.count ?? 0,
      registrationsLast24h: reg?.recent ?? 0,
    }
  })
}

export async function eventView(event) {
  return (await eventViews([event]))[0]
}

/** 1-based place in the queue: earlier queuedAt first, ties broken by id. */
export async function waitlistPosition(r) {
  const ahead = await Registration.countDocuments({
    event: r.event,
    status: 'WAITLISTED',
    _id: { $ne: r._id },
    $or: [{ queuedAt: { $lt: r.queuedAt } }, { queuedAt: r.queuedAt, _id: { $lt: r._id } }],
  })
  return ahead + 1
}

/** Registration documents (all for one user) -> Ticket[], in the same order. */
export async function ticketViews(regs, eventsById) {
  if (!regs.length) return []
  const events = eventsById ?? new Map(
    (await Event.find({ _id: { $in: regs.map((r) => r.event) } }).lean()).map((e) => [e._id, e]))
  const rated = new Set((await Feedback.find(
    { user: regs[0].user, event: { $in: regs.map((r) => r.event) } }, { event: 1 }).lean()).map((f) => f.event))

  return Promise.all(regs.map(async (r) => {
    const e = events.get(r.event)
    return {
      id: r._id,
      eventId: e._id,
      eventTitle: e.title,
      venue: e.venue,
      startAt: toLocal(e.startAt),
      endAt: toLocal(e.endAt),
      category: e.category,
      status: r.status,
      ticketCode: holdsSeat(r) ? r.ticketCode : null,
      waitlistPosition: r.status === 'WAITLISTED' ? await waitlistPosition(r) : null,
      registeredAt: toLocal(r.createdAt),
      checkedInAt: toLocal(r.checkedInAt),
      feedbackGiven: rated.has(r.event),
    }
  }))
}

export async function ticketView(reg) {
  return (await ticketViews([reg]))[0]
}
