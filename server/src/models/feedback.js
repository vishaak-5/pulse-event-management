import mongoose from 'mongoose'
import { withNumericId } from './counter.js'

const feedbackSchema = new mongoose.Schema({
  _id: Number,
  event: { type: Number, ref: 'Event', required: true },
  user: { type: Number, ref: 'User', required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, default: null, maxlength: 1000 },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false, collection: 'feedback' })

feedbackSchema.index({ event: 1, user: 1 }, { unique: true })

withNumericId(feedbackSchema, 'feedback')

export default mongoose.model('Feedback', feedbackSchema)
