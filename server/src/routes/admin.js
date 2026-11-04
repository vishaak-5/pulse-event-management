import { Router } from 'express'
import { EVENT_STATUSES } from '../models/event.js'
import { requireRole } from '../middleware/auth.js'
import { badRequest } from '../lib/errors.js'
import { parseId, rejectSchema, userUpdateSchema } from '../lib/validation.js'
import { approveEvent, listForAdmin, rejectEvent } from '../services/events.js'
import { adminStats } from '../services/stats.js'
import { listUsers, updateUser } from '../services/users.js'

const router = Router()
router.use(requireRole('ADMIN'))

router.get('/stats', async (req, res) => {
  res.json(await adminStats())
})

router.get('/events', async (req, res) => {
  const { status } = req.query
  if (status && !EVENT_STATUSES.includes(status)) {
    throw badRequest('Some of the details entered are not valid. Please check and try again.')
  }
  res.json(await listForAdmin(status))
})

router.post('/events/:id/approve', async (req, res) => {
  res.json(await approveEvent(parseId(req.params.id)))
})

router.post('/events/:id/reject', async (req, res) => {
  const { reason } = rejectSchema.parse(req.body ?? {})
  res.json(await rejectEvent(parseId(req.params.id), reason))
})

router.get('/users', async (req, res) => {
  res.json(await listUsers())
})

router.patch('/users/:id', async (req, res) => {
  res.json(await updateUser(parseId(req.params.id), userUpdateSchema.parse(req.body ?? {}), req.user))
})

export default router
