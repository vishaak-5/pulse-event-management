import mongoose from 'mongoose'
import { withNumericId } from './counter.js'

export const ROLES = ['ADMIN', 'ORGANIZER', 'ATTENDEE']

const userSchema = new mongoose.Schema({
  _id: Number,
  name: { type: String, required: true, maxlength: 100, trim: true },
  email: { type: String, required: true, unique: true, maxlength: 150, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ROLES, required: true },
  enabled: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false })

withNumericId(userSchema, 'users')

export default mongoose.model('User', userSchema)
