// Endpoints anyone can call, signed in or not.
import { Router } from 'express'
import { CATEGORIES } from '../models/event.js'
import { badRequest } from '../lib/errors.js'
import { subscribeSeats } from '../lib/live.js'
import { parseId } from '../lib/validation.js'
import { verifyCertificate } from '../services/certificates.js'
import { getEvent, listPublic } from '../services/events.js'
import { eventFeedback } from '../services/feedback.js'
import { publicStats } from '../services/stats.js'

const router = Router()

router.get('/events', async (req, res) => {
  const { q, category, includePast } = req.query
  if (category && !CATEGORIES.includes(category)) {
    throw badRequest('Some of the details entered are not valid. Please check and try again.')
  }
  res.json(await listPublic({ q: typeof q === 'string' ? q : '', category, includePast: includePast === 'true' }))
})

/** req.user is undefined for anonymous callers. */
router.get('/events/:id', async (req, res) => {
  res.json(await getEvent(parseId(req.params.id), req.user))
})

router.get('/events/:id/feedback', async (req, res) => {
  res.json(await eventFeedback(parseId(req.params.id)))
})

/** Live seat counts for one event (Server-Sent Events). */
router.get('/events/:id/stream', async (req, res) => {
  const id = parseId(req.params.id)
  await getEvent(id, undefined) // 404 unless the event is public
  subscribeSeats(id, req, res)
})

router.get('/certificates/:code', async (req, res) => {
  res.json(await verifyCertificate(req.params.code))
})

router.get('/stats/public', async (req, res) => {
  res.json(await publicStats())
})

export default router
