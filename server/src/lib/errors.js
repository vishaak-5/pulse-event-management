import { ZodError } from 'zod'

/** Thrown by services; rendered as {"error": message} with the given HTTP status. */
export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export const notFound = (what) => new ApiError(404, `${what} not found.`)
export const badRequest = (msg) => new ApiError(400, msg)
export const conflict = (msg) => new ApiError(409, msg)
export const forbidden = (msg) => new ApiError(403, msg)

/** Express error handler: every error becomes the same {error} envelope. */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message })
  }
  if (err instanceof ZodError) {
    // Schemas carry sentence-style messages ("Title is required.").
    const messages = [...new Set(err.issues.map((i) => i.message))]
    return res.status(400).json({ error: messages.join(' ') })
  }
  if (err?.type === 'entity.parse.failed' || err?.name === 'CastError') {
    return res.status(400).json({ error: 'Some of the details entered are not valid. Please check and try again.' })
  }
  if (err?.code === 11000) {
    return res.status(409).json({ error: 'That conflicts with existing data.' })
  }
  console.error('Unhandled error', err)
  return res.status(500).json({ error: 'Something went wrong on our side.' })
}
