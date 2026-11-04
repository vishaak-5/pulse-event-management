// Request body schemas (zod). Every message is a full sentence a person can act on,
// so the React app can show the server's error text as-is.
import { z } from 'zod'
import { CATEGORIES } from '../models/event.js'
import { ROLES } from '../models/user.js'

const required = (label) => ({ required_error: `${label} is required.`, invalid_type_error: `${label} is not valid.` })

/** Trimmed text; blank counts as missing. */
const text = (label, max) => z.string(required(label)).trim()
  .min(1, `${label} is required.`)
  .max(max, `${label} can be at most ${max} characters.`)

const optionalText = (label, max) => z.string({ invalid_type_error: `${label} is not valid.` })
  .trim().max(max, `${label} can be at most ${max} characters.`)
  .nullish().transform((v) => (v ? v : null))

const choice = (label, values) => z.enum(values, {
  errorMap: (issue) => ({
    message: issue.code === 'invalid_type' && issue.received === 'undefined'
      ? `${label} is required.` : `${label} is not valid.`,
  }),
})

/** Local date-time string ("2026-11-04T09:00") -> Date. */
const dateTime = (label) => z.string(required(label))
  .refine((s) => !Number.isNaN(new Date(s).getTime()), `${label} is not a valid date and time.`)
  .transform((s) => new Date(s))

export const registerSchema = z.object({
  name: text('Name', 100),
  email: text('Email', 150).pipe(z.string().email('Email must be a valid email address.')),
  password: z.string(required('Password')).min(8, 'Password must be 8-72 characters.')
    .max(72, 'Password must be 8-72 characters.'),
  role: choice('Account type', ROLES),
})

export const loginSchema = z.object({
  email: text('Email', 150),
  password: z.string(required('Password')).min(1, 'Password is required.'),
})

export const eventSchema = z.object({
  title: text('Title', 150),
  description: text('Description', 5000),
  category: choice('Category', CATEGORIES),
  venue: text('Venue', 200),
  startAt: dateTime('Start time').refine((d) => d > new Date(), 'Start time must be in the future.'),
  endAt: dateTime('End time'),
  capacity: z.number(required('Capacity')).int('Capacity must be a whole number.')
    .min(1, 'Capacity must be at least 1.').max(100000, 'Capacity can be at most 100000.'),
})

export const rejectSchema = z.object({ reason: optionalText('Reason', 300) }).default({})

export const releaseSchema = z.object({
  seats: z.number(required('Seats')).int('Seats must be a whole number.').min(1, 'Seats must be at least 1.'),
})

export const checkInSchema = z.object({
  ticketCode: text('Ticket code', 100),
  eventId: z.number({ invalid_type_error: 'Event is not valid.' }).int().nullish(),
})

export const feedbackSchema = z.object({
  rating: z.number(required('Rating')).int('Rating must be a whole number.')
    .min(1, 'Rating must be between 1 and 5.').max(5, 'Rating must be between 1 and 5.'),
  comment: optionalText('Comment', 1000),
})

export const userUpdateSchema = z.object({
  enabled: z.boolean({ invalid_type_error: 'Enabled must be true or false.' }).optional(),
  role: choice('Role', ROLES).optional(),
})

/** Route ids: "/events/abc" is a 404, not a server error. */
export function parseId(value) {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}
