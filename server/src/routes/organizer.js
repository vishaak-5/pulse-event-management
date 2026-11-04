import { Router } from 'express'
import { requireRole } from '../middleware/auth.js'
import { subscribeWall } from '../lib/live.js'
import { checkInSchema, eventSchema, parseId, releaseSchema } from '../lib/validation.js'
import {
  cancelEvent, createEvent, deleteEvent, listForOrganizer, releaseSeats, updateEvent,
} from '../services/events.js'
import { attendees, checkIn, liveSnapshot } from '../services/registrations.js'
import { eventAnalytics, organizerOverview } from '../services/stats.js'

const router = Router()
router.use(requireRole('ORGANIZER', 'ADMIN'))

router.get('/overview', async (req, res) => {
  res.json(await organizerOverview(req.user))
})

// ---- event CRUD ----

router.get('/events', async (req, res) => {
  res.json(await listForOrganizer(req.user))
})

router.post('/events', async (req, res) => {
  res.status(201).json(await createEvent(eventSchema.parse(req.body ?? {}), req.user))
})

router.put('/events/:id', async (req, res) => {
  res.json(await updateEvent(parseId(req.params.id), eventSchema.parse(req.body ?? {}), req.user))
})

router.delete('/events/:id', async (req, res) => {
  await deleteEvent(parseId(req.params.id), req.user)
  res.status(204).end()
})

router.post('/events/:id/cancel', async (req, res) => {
  res.json(await cancelEvent(parseId(req.params.id), req.user))
})

// ---- running the event ----

router.get('/events/:id/attendees', async (req, res) => {
  res.json(await attendees(parseId(req.params.id), req.user))
})

router.get('/events/:id/analytics', async (req, res) => {
  res.json(await eventAnalytics(parseId(req.params.id), req.user))
})

router.post('/checkin', async (req, res) => {
  res.json(await checkIn(checkInSchema.parse(req.body ?? {}), req.user))
})

router.post('/events/:id/release-seats', async (req, res) => {
  const { seats } = releaseSchema.parse(req.body ?? {})
  res.json(await releaseSeats(parseId(req.params.id), seats, req.user))
})

router.get('/events/:id/live/snapshot', async (req, res) => {
  res.json(await liveSnapshot(parseId(req.params.id), req.user))
})

/** Server-Sent Events stream of check-ins for the live wall. */
router.get('/events/:id/live', async (req, res) => {
  const id = parseId(req.params.id)
  await liveSnapshot(id, req.user) // ownership check
  subscribeWall(id, req, res)
})

export default router
