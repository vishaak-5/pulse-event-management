// The Express application: middleware, routes and the error handler.
// Kept apart from index.js so the tests can use it without opening a port.
import cors from 'cors'
import express from 'express'
import { config } from './config.js'
import { normalizeAddress } from './lib/address.js'
import { ApiError, errorHandler } from './lib/errors.js'
import { authenticate } from './middleware/auth.js'
import adminRoutes from './routes/admin.js'
import attendeeRoutes from './routes/attendee.js'
import authRoutes from './routes/auth.js'
import organizerRoutes from './routes/organizer.js'
import publicRoutes from './routes/public.js'

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)

  app.use('/api', cors({
    origin: config.corsOrigins.map((o) => o.trim()).filter(Boolean).map(normalizeAddress),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  }))
  app.use(express.json({ limit: '100kb' }))
  app.use(authenticate)

  // Render's health check and a quick "is it up" for people.
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }))

  app.use('/api/auth', authRoutes)
  app.use('/api/attendee', attendeeRoutes)
  app.use('/api/organizer', organizerRoutes)
  app.use('/api/admin', adminRoutes)
  app.use('/api', publicRoutes)

  app.use((req, res, next) => next(new ApiError(404, 'Not found.')))
  app.use(errorHandler)
  return app
}
