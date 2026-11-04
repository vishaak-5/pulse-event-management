import { Router } from 'express'
import { requireRole } from '../middleware/auth.js'
import { qrPng } from '../lib/qr.js'
import { feedbackSchema, parseId } from '../lib/validation.js'
import { certificatePdf } from '../services/certificates.js'
import { submitFeedback } from '../services/feedback.js'
import { recommendationsFor } from '../services/recommendations.js'
import { cancel, myTicketForEvent, myTickets, register, ticketCodeFor } from '../services/registrations.js'

const router = Router()
router.use(requireRole('ATTENDEE'))

router.post('/events/:id/register', async (req, res) => {
  res.json(await register(parseId(req.params.id), req.user))
})

router.delete('/events/:id/register', async (req, res) => {
  res.json(await cancel(parseId(req.params.id), req.user))
})

/** 204 when the user has never registered for this event. */
router.get('/events/:id/ticket', async (req, res) => {
  const ticket = await myTicketForEvent(parseId(req.params.id), req.user)
  if (ticket) res.json(ticket)
  else res.status(204).end()
})

router.get('/tickets', async (req, res) => {
  res.json(await myTickets(req.user))
})

router.get('/tickets/:id/qr', async (req, res) => {
  const code = await ticketCodeFor(parseId(req.params.id), req.user)
  res.set('Cache-Control', 'no-store').type('png').send(await qrPng(code, 360))
})

router.get('/tickets/:id/certificate', async (req, res) => {
  const id = parseId(req.params.id)
  const pdf = await certificatePdf(id, req.user)
  res.set({ 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="certificate-${id}.pdf"` })
    .type('pdf').send(pdf)
})

router.get('/recommendations', async (req, res) => {
  res.json(await recommendationsFor(req.user))
})

router.post('/events/:id/feedback', async (req, res) => {
  res.json(await submitFeedback(parseId(req.params.id), feedbackSchema.parse(req.body ?? {}), req.user))
})

export default router
