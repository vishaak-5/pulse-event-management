// Registration, cancellation, the waitlist and check-in.
// Seat changes go through seats.js, whose atomic updates keep capacity exact
// even when many people register at the same moment.
import Event from '../models/event.js'
import Registration from '../models/registration.js'
import User from '../models/user.js'
import { ApiError, badRequest, conflict, notFound } from '../lib/errors.js'
import { sendEmail } from '../lib/email.js'
import { pushCheckIn } from '../lib/live.js'
import { toLocal, when } from '../lib/time.js'
import { findEvent, requireManage } from './events.js'
import { estimateShowRates } from './forecast.js'
import { fillFromWaitlist, notifySeats, releaseSeat, reserveSeat } from './seats.js'
import { holdsSeat, ticketView, ticketViews } from './views.js'

export async function register(eventId, user) {
  const event = await findEvent(eventId)
  if (event.status !== 'APPROVED') throw badRequest('This event is not open for registration.')
  if (event.endAt <= new Date()) throw badRequest('This event has already ended.')
  if (event.organizer === user.id) throw badRequest('You cannot register for your own event.')

  const existing = await Registration.findOne({ event: eventId, user: user.id }).lean()
  if (existing && existing.status !== 'CANCELLED') throw conflict('You are already registered for this event.')

  const seat = await reserveSeat(eventId)
  const status = seat ? 'CONFIRMED' : 'WAITLISTED'
  let reg
  try {
    if (existing) {
      // Re-registering after a cancellation: back in play with a fresh place in the queue.
      reg = await Registration.findOneAndUpdate(
        { _id: existing._id, status: 'CANCELLED' },
        { $set: { status, queuedAt: new Date(), checkedInAt: null } },
        { new: true },
      ).lean()
      if (!reg) throw conflict('You are already registered for this event.')
    } else {
      reg = (await Registration.create({ event: eventId, user: user.id, status })).toObject()
    }
  } catch (e) {
    if (seat) await releaseSeat(eventId) // the seat was never used
    if (e.code === 11000) throw conflict('You are already registered for this event.')
    throw e
  }

  if (status === 'CONFIRMED') {
    sendEmail(user.email, `You're in: ${event.title}`, 'Your seat is confirmed',
      `See you at "${event.title}" on ${when(event.startAt)} at ${event.venue}.\n`
      + 'Your QR ticket is in My Tickets - show it at the entrance.')
  } else {
    sendEmail(user.email, `Waitlisted: ${event.title}`, "You're on the waitlist",
      `"${event.title}" is full right now. We'll confirm your seat automatically `
      + 'and email you the moment one frees up.')
    // A seat freed between our check and our insert would otherwise sit empty.
    if (await fillFromWaitlist(event)) reg = await Registration.findById(reg._id).lean()
  }
  notifySeats(eventId)
  return ticketView(reg)
}

export async function cancel(eventId, user) {
  const event = await findEvent(eventId)
  const reg = await Registration.findOne({ event: eventId, user: user.id, status: { $ne: 'CANCELLED' } }).lean()
  if (!reg) throw notFound('Registration')
  if (reg.status === 'CHECKED_IN') throw badRequest('You have already checked in to this event.')

  // Only succeeds if nobody (a promotion, a check-in) changed it in the meantime.
  const updated = await Registration.findOneAndUpdate(
    { _id: reg._id, status: reg.status },
    { $set: { status: 'CANCELLED' } },
    { new: true },
  ).lean()
  if (!updated) throw conflict('Your registration changed just now. Please refresh and try again.')

  if (reg.status === 'CONFIRMED') {
    await releaseSeat(eventId)
    await fillFromWaitlist(event)
  }
  notifySeats(eventId)
  return ticketView(updated)
}

export async function myTickets(user) {
  const regs = await Registration.find({ user: user.id }).lean()
  const events = new Map((await Event.find({ _id: { $in: regs.map((r) => r.event) } }).lean()).map((e) => [e._id, e]))
  regs.sort((a, b) => events.get(b.event).startAt - events.get(a.event).startAt)
  return ticketViews(regs, events)
}

/** The caller's ticket for one event, or null if they never registered. */
export async function myTicketForEvent(eventId, user) {
  const reg = await Registration.findOne({ event: eventId, user: user.id }).lean()
  return reg ? ticketView(reg) : null
}

/** Ticket code for the QR image; only issued while the registration holds a seat. */
export async function ticketCodeFor(registrationId, user) {
  const reg = await Registration.findOne({ _id: registrationId, user: user.id }).lean()
  if (!reg) throw notFound('Ticket')
  if (!holdsSeat(reg)) throw badRequest('This registration has no active ticket.')
  return reg.ticketCode
}

export async function attendees(eventId, actor) {
  const event = await findEvent(eventId)
  requireManage(event, actor)
  const regs = await Registration.find({ event: eventId }).sort({ queuedAt: 1 }).lean()
  const users = new Map((await User.find({ _id: { $in: regs.map((r) => r.user) } }).lean()).map((u) => [u._id, u]))
  const estimates = await estimateShowRates(eventId, regs.filter(holdsSeat).map((r) => r.user))
  return regs.map((r) => {
    const u = users.get(r.user)
    const est = holdsSeat(r) ? estimates.get(r.user) : null
    return {
      registrationId: r._id,
      userId: r.user,
      name: u?.name ?? 'Unknown',
      email: u?.email ?? '',
      status: r.status,
      queuedAt: toLocal(r.queuedAt),
      checkedInAt: toLocal(r.checkedInAt),
      showRate: est ? est.showRate : null,
      pastEvents: est ? est.pastEvents : null,
    }
  })
}

const countBy = (eventId, status) => Registration.countDocuments({ event: eventId, status })

export async function liveSnapshot(eventId, actor) {
  const event = await findEvent(eventId)
  requireManage(event, actor)
  const recent = await Registration.find({ event: eventId, status: 'CHECKED_IN' })
    .sort({ checkedInAt: -1 }).limit(14).lean()
  const names = new Map((await User.find({ _id: { $in: recent.map((r) => r.user) } }, { name: 1 }).lean())
    .map((u) => [u._id, u.name]))
  return {
    eventId: event._id,
    title: event.title,
    venue: event.venue,
    startAt: toLocal(event.startAt),
    capacity: event.capacity,
    seated: event.seatsTaken,
    checkedIn: await countBy(eventId, 'CHECKED_IN'),
    recent: recent.map((r) => ({ name: names.get(r.user) ?? 'Guest', at: toLocal(r.checkedInAt) })),
  }
}

export async function checkIn({ ticketCode, eventId }, actor) {
  const reg = await Registration.findOne({ ticketCode: ticketCode.trim() }).lean()
  if (!reg) throw notFound('Ticket')
  const event = await findEvent(reg.event)
  requireManage(event, actor)
  if (eventId != null && eventId !== event._id) {
    throw badRequest(`This ticket is for a different event: ${event.title}.`)
  }
  const attendee = await User.findById(reg.user).lean()

  // Conditional update: a ticket scanned twice at once is still checked in only once.
  const done = await Registration.findOneAndUpdate(
    { _id: reg._id, status: 'CONFIRMED' },
    { $set: { status: 'CHECKED_IN', checkedInAt: new Date() } },
    { new: true },
  ).lean()
  if (!done) {
    const now = await Registration.findById(reg._id).lean()
    if (now.status === 'CHECKED_IN') {
      throw new ApiError(409, `${attendee.name} already checked in at ${when(now.checkedInAt)}.`)
    }
    if (now.status === 'WAITLISTED') throw badRequest('This attendee is still on the waitlist.')
    throw badRequest('This registration was cancelled.')
  }

  const fresh = await Event.findById(event._id).lean()
  pushCheckIn(event._id, {
    eventId: event._id,
    attendeeName: attendee.name,
    at: toLocal(done.checkedInAt),
    checkedIn: await countBy(event._id, 'CHECKED_IN'),
    seated: fresh.seatsTaken,
    capacity: fresh.capacity,
  })
  return {
    attendeeName: attendee.name,
    attendeeEmail: attendee.email,
    eventTitle: event.title,
    checkedInAt: toLocal(done.checkedInAt),
  }
}
