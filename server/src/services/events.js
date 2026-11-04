import Event from '../models/event.js'
import Feedback from '../models/feedback.js'
import Registration from '../models/registration.js'
import User from '../models/user.js'
import { isAdmin } from '../middleware/auth.js'
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js'
import { sendEmail } from '../lib/email.js'
import { when } from '../lib/time.js'
import { fillFromWaitlist, notifySeats } from './seats.js'
import { eventView, eventViews } from './views.js'

export const canManage = (event, user) => !!user && (isAdmin(user) || event.organizer === user.id)

export function requireManage(event, user) {
  if (!canManage(event, user)) throw forbidden("Only this event's organizer can do that.")
}

export async function findEvent(id) {
  const e = id && await Event.findById(id).lean()
  if (!e) throw notFound('Event')
  return e
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// ---- reads ----

/** Public list: approved events, upcoming unless includePast, optional search and category. */
export async function listPublic({ q, category, includePast }) {
  const filter = { status: 'APPROVED' }
  if (!includePast) filter.endAt = { $gt: new Date() }
  if (category) filter.category = category
  const query = q?.trim()
  if (query) {
    const re = new RegExp(escapeRegex(query), 'i')
    filter.$or = [{ title: re }, { venue: re }]
  }
  return eventViews(await Event.find(filter).sort({ startAt: 1 }).lean())
}

/** Approved events are public; others are visible only to their organizer and admins. */
export async function getEvent(id, viewer) {
  const e = await findEvent(id)
  if (e.status !== 'APPROVED' && !canManage(e, viewer)) throw notFound('Event')
  return eventView(e)
}

export async function listForOrganizer(user) {
  return eventViews(await Event.find({ organizer: user.id }).sort({ startAt: -1 }).lean())
}

export async function listForAdmin(status) {
  return eventViews(await Event.find(status ? { status } : {}).sort({ createdAt: -1 }).lean())
}

// ---- organizer actions ----

function checkTimes(req) {
  if (req.endAt <= req.startAt) throw badRequest('End time must be after the start time.')
}

const fields = (req) => ({
  title: req.title, description: req.description, category: req.category, venue: req.venue,
  startAt: req.startAt, endAt: req.endAt, capacity: req.capacity,
})

export async function createEvent(req, user) {
  checkTimes(req)
  // Admin-created events skip the approval queue.
  const e = await Event.create({ ...fields(req), organizer: user.id, status: isAdmin(user) ? 'APPROVED' : 'PENDING' })
  return eventView(e.toObject())
}

export async function updateEvent(id, req, user) {
  checkTimes(req)
  const e = await findEvent(id)
  requireManage(e, user)
  if (e.status === 'CANCELLED') throw badRequest('A cancelled event cannot be edited.')

  const set = { ...fields(req) }
  if (req.startAt.getTime() !== e.startAt.getTime()) set.reminderSent = false
  // A rejected event goes back for review once the organizer fixes it.
  if (e.status === 'REJECTED' && !isAdmin(user)) {
    set.status = 'PENDING'
    set.rejectionReason = null
  }
  // The capacity check and the write are one atomic step, so a registration
  // landing in between cannot leave more seats taken than the new capacity.
  const updated = await Event.findOneAndUpdate(
    { _id: id, status: { $ne: 'CANCELLED' }, seatsTaken: { $lte: req.capacity } },
    { $set: set },
    { new: true },
  ).lean()
  if (!updated) {
    const now = await findEvent(id)
    if (now.status === 'CANCELLED') throw badRequest('A cancelled event cannot be edited.')
    throw badRequest(`Capacity cannot go below the ${now.seatsTaken} seats already taken.`)
  }
  if (req.capacity > e.capacity) await fillFromWaitlist(updated)
  notifySeats(id)
  return eventView(await findEvent(id))
}

/**
 * Acts on the turnout forecast: adds `seats` extra seats so that many people are
 * promoted from the waitlist straight away. Allowed once per event, so repeated
 * clicks cannot keep overbooking.
 */
export async function releaseSeats(id, seats, user) {
  const e = await findEvent(id)
  requireManage(e, user)
  if (e.status !== 'APPROVED' || e.startAt <= new Date()) {
    throw badRequest('Seats can only be released before an approved event starts.')
  }
  if (e.releasedSeats > 0) throw conflict('Forecast seats were already released for this event.')
  const waiting = await Registration.countDocuments({ event: id, status: 'WAITLISTED' })
  if (seats > waiting) throw badRequest(`Only ${waiting} people are on the waitlist.`)

  const updated = await Event.findOneAndUpdate(
    { _id: id, releasedSeats: 0 },
    { $inc: { capacity: seats }, $set: { releasedSeats: seats } },
    { new: true },
  ).lean()
  if (!updated) throw conflict('Forecast seats were already released for this event.')
  await fillFromWaitlist(updated)
  notifySeats(id)
  return eventView(await findEvent(id))
}

async function emailActiveRegistrants(eventId, subject, heading, body) {
  const regs = await Registration.find({ event: eventId, status: { $ne: 'CANCELLED' } }, { user: 1 }).lean()
  const users = await User.find({ _id: { $in: regs.map((r) => r.user) } }, { email: 1 }).lean()
  for (const u of users) sendEmail(u.email, subject, heading, body)
}

export async function cancelEvent(id, user) {
  const e = await findEvent(id)
  requireManage(e, user)
  if (e.status === 'CANCELLED') return eventView(e)

  await emailActiveRegistrants(id, `Event cancelled: ${e.title}`, 'This event has been cancelled',
    `We're sorry - "${e.title}" scheduled for ${when(e.startAt)} has been cancelled by the organizer. `
    + 'Your registration has been released.')
  await Event.updateOne({ _id: id }, { $set: { status: 'CANCELLED', seatsTaken: 0 } })
  await Registration.updateMany({ event: id, status: { $ne: 'CANCELLED' } }, { $set: { status: 'CANCELLED' } })
  notifySeats(id)
  return eventView(await findEvent(id))
}

/**
 * Permanently removes an event with its registrations and ratings. Events that
 * already have checked-in attendees are kept, because their certificates must
 * stay verifiable - those can be cancelled instead.
 */
export async function deleteEvent(id, user) {
  const e = await findEvent(id)
  requireManage(e, user)
  if (await Registration.exists({ event: id, status: 'CHECKED_IN' })) {
    throw conflict('People have already checked in to this event, so it is kept for their certificates. '
      + 'Cancel it instead.')
  }
  if (e.status !== 'CANCELLED' && e.endAt > new Date()) {
    await emailActiveRegistrants(id, `Event cancelled: ${e.title}`, 'This event has been cancelled',
      `We're sorry - "${e.title}" scheduled for ${when(e.startAt)} has been withdrawn by the organizer. `
      + 'Your registration has been released.')
  }
  await Promise.all([Registration.deleteMany({ event: id }), Feedback.deleteMany({ event: id })])
  await Event.deleteOne({ _id: id })
}

// ---- admin actions ----

export async function approveEvent(id) {
  const e = await findEvent(id)
  if (e.status !== 'PENDING' && e.status !== 'REJECTED') {
    throw badRequest('Only pending or rejected events can be approved.')
  }
  await Event.updateOne({ _id: id }, { $set: { status: 'APPROVED', rejectionReason: null } })
  const organizer = await User.findById(e.organizer).lean()
  if (organizer) {
    sendEmail(organizer.email, `Approved: ${e.title}`, 'Your event is live',
      `"${e.title}" has been approved and is now open for registrations.`)
  }
  return eventView(await findEvent(id))
}

export async function rejectEvent(id, reason) {
  const e = await findEvent(id)
  if (e.status !== 'PENDING') throw badRequest('Only pending events can be rejected.')
  await Event.updateOne({ _id: id }, { $set: { status: 'REJECTED', rejectionReason: reason ?? null } })
  const organizer = await User.findById(e.organizer).lean()
  if (organizer) {
    sendEmail(organizer.email, `Changes needed: ${e.title}`, 'Your event needs changes',
      `"${e.title}" was not approved.${reason ? `\nReason: ${reason}` : ''}`
      + '\nEdit the event and it will be sent for review again.')
  }
  return eventView(await findEvent(id))
}
