import crypto from 'node:crypto'
import mongoose from 'mongoose'
import { withNumericId } from './counter.js'

export const REG_STATUSES = ['CONFIRMED', 'WAITLISTED', 'CANCELLED', 'CHECKED_IN']
export const SEAT_HOLDING = ['CONFIRMED', 'CHECKED_IN']

/**
 * One document per (event, attendee). Cancelling and re-registering reuses it,
 * so queuedAt - not createdAt - decides waitlist order.
 */
const registrationSchema = new mongoose.Schema({
  _id: Number,
  event: { type: Number, ref: 'Event', required: true },
  user: { type: Number, ref: 'User', required: true },
  status: { type: String, enum: REG_STATUSES, required: true },
  ticketCode: { type: String, default: () => crypto.randomUUID() },
  queuedAt: { type: Date, default: Date.now },
  checkedInAt: { type: Date, default: null },
  /** Public id printed on the participation certificate; issued on first download. */
  certificateCode: { type: String },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false })

registrationSchema.index({ event: 1, user: 1 }, { unique: true })
registrationSchema.index({ ticketCode: 1 }, { unique: true })
registrationSchema.index({ certificateCode: 1 }, { unique: true, sparse: true })
registrationSchema.index({ event: 1, status: 1, queuedAt: 1 })
registrationSchema.index({ user: 1 })

registrationSchema.methods.holdsSeat = function holdsSeat() {
  return SEAT_HOLDING.includes(this.status)
}

withNumericId(registrationSchema, 'registrations')

export default mongoose.model('Registration', registrationSchema)
