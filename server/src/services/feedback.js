import Feedback from '../models/feedback.js'
import Registration from '../models/registration.js'
import User from '../models/user.js'
import { badRequest, forbidden, notFound } from '../lib/errors.js'
import { findEvent } from './events.js'
import { feedbackView, holdsSeat } from './views.js'

/** Attendees who held a seat can rate an event once it has started; resubmitting updates the rating. */
export async function submitFeedback(eventId, { rating, comment }, user) {
  const event = await findEvent(eventId)
  if (event.startAt > new Date()) throw badRequest('You can rate this event once it has started.')
  const reg = await Registration.findOne({ event: eventId, user: user.id }).lean()
  if (!reg || !holdsSeat(reg)) throw forbidden('Only attendees of this event can rate it.')

  // Upsert: one rating per attendee per event (unique index on event + user).
  let f = await Feedback.findOneAndUpdate(
    { event: eventId, user: user.id },
    { $set: { rating, comment, createdAt: new Date() } },
    { new: true },
  ).lean()
  if (!f) f = (await Feedback.create({ event: eventId, user: user.id, rating, comment })).toObject()
  return feedbackView(f, user.name)
}

export async function eventFeedback(eventId) {
  const event = await findEvent(eventId)
  if (event.status !== 'APPROVED') throw notFound('Event')
  const list = await Feedback.find({ event: eventId }).sort({ createdAt: -1 }).lean()
  const names = new Map((await User.find({ _id: { $in: list.map((f) => f.user) } }, { name: 1 }).lean())
    .map((u) => [u._id, u.name]))
  return list.map((f) => feedbackView(f, names.get(f.user) ?? 'Attendee'))
}
