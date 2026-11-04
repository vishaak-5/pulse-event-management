// Seat accounting. Event.seatsTaken is the number of seat-holding registrations,
// and every change to it is a single atomic MongoDB update with a condition:
//
//   reserve:  { _id, status: APPROVED, seatsTaken < capacity }  ->  $inc seatsTaken +1
//
// MongoDB applies the filter and the increment as one step per document, so when
// two people race for the last seat exactly one update matches; the other gets
// null and is waitlisted. This replaces the row lock a SQL database would use.
import Event from '../models/event.js'
import Registration, { SEAT_HOLDING } from '../models/registration.js'
import User from '../models/user.js'
import { sendEmail } from '../lib/email.js'
import { hasSeatViewers, pushSeats } from '../lib/live.js'
import { when } from '../lib/time.js'

/** Takes one seat if the event is open and not full. Returns the updated event or null. */
export function reserveSeat(eventId) {
  return Event.findOneAndUpdate(
    {
      _id: eventId,
      status: 'APPROVED',
      endAt: { $gt: new Date() },
      $expr: { $lt: ['$seatsTaken', '$capacity'] },
    },
    { $inc: { seatsTaken: 1 } },
    { new: true },
  ).lean()
}

/** Gives one seat back. */
export function releaseSeat(eventId) {
  return Event.updateOne({ _id: eventId, seatsTaken: { $gt: 0 } }, { $inc: { seatsTaken: -1 } })
}

/**
 * Moves waitlisted attendees, oldest first, into free seats - one atomic seat
 * reservation per person, so it is safe to run while others register or cancel.
 */
export async function fillFromWaitlist(event) {
  const promoted = []
  for (;;) {
    const seat = await reserveSeat(event._id)
    if (!seat) break
    const next = await Registration.findOneAndUpdate(
      { event: event._id, status: 'WAITLISTED' },
      { $set: { status: 'CONFIRMED' } },
      { sort: { queuedAt: 1, _id: 1 }, new: true },
    ).lean()
    if (!next) {
      await releaseSeat(event._id) // nobody waiting: give the seat back
      break
    }
    promoted.push(next.user)
  }
  if (promoted.length) {
    const users = await User.find({ _id: { $in: promoted } }, { email: 1 }).lean()
    for (const u of users) {
      sendEmail(u.email, `Good news - you're in: ${event.title}`, 'A seat opened up for you',
        `You've moved off the waitlist for "${event.title}" on ${when(event.startAt)}. `
        + 'Your QR ticket is now in My Tickets.')
    }
  }
  return promoted.length
}

/** Recomputes seatsTaken from the registrations (seeding and repair). */
export async function recountSeats(eventId) {
  const seatsTaken = await Registration.countDocuments({ event: eventId, status: { $in: SEAT_HOLDING } })
  await Event.updateOne({ _id: eventId }, { $set: { seatsTaken } })
  return seatsTaken
}

/** Current seat numbers for one event (the SeatCounts payload). */
export async function seatCounts(eventId) {
  const e = await Event.findById(eventId).lean()
  if (!e) return null
  const since = new Date(Date.now() - 24 * 3_600_000)
  const [waitlistCount, registrationsLast24h] = await Promise.all([
    Registration.countDocuments({ event: eventId, status: 'WAITLISTED' }),
    Registration.countDocuments({ event: eventId, createdAt: { $gt: since } }),
  ])
  return {
    eventId: e._id,
    capacity: e.capacity,
    seatsTaken: e.seatsTaken,
    seatsLeft: Math.max(0, e.capacity - e.seatsTaken),
    waitlistCount,
    registrationsLast24h,
  }
}

/** Pushes fresh seat numbers to anyone watching the event page. Never throws. */
export async function notifySeats(eventId) {
  if (!hasSeatViewers(eventId)) return
  try {
    const counts = await seatCounts(eventId)
    if (counts) pushSeats(eventId, counts)
  } catch (e) {
    console.warn('Could not push seat counts', e.message)
  }
}
