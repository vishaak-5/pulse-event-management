import mongoose from 'mongoose'
import { withNumericId } from './counter.js'

export const CATEGORIES = ['TECH', 'MUSIC', 'SPORTS', 'WORKSHOP', 'CULTURAL', 'BUSINESS', 'OTHER']
export const EVENT_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']

const eventSchema = new mongoose.Schema({
  _id: Number,
  title: { type: String, required: true, maxlength: 150 },
  description: { type: String, required: true, maxlength: 5000 },
  category: { type: String, enum: CATEGORIES, required: true },
  venue: { type: String, required: true, maxlength: 200 },
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  capacity: { type: Number, required: true, min: 1 },
  /**
   * Seats held (CONFIRMED + CHECKED_IN). Changed only with atomic conditional
   * updates ($inc guarded by seatsTaken < capacity), so two people can never
   * get the last seat at the same time. See services/seats.js.
   */
  seatsTaken: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: EVENT_STATUSES, default: 'PENDING' },
  rejectionReason: { type: String, default: null, maxlength: 300 },
  organizer: { type: Number, ref: 'User', required: true },
  reminderSent: { type: Boolean, default: false },
  /** Extra seats added because of the turnout forecast (released at most once). */
  releasedSeats: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false })

eventSchema.index({ status: 1, startAt: 1 })
eventSchema.index({ organizer: 1 })

withNumericId(eventSchema, 'events')

export default mongoose.model('Event', eventSchema)
