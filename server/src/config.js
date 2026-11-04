// Central configuration, read once from environment variables.
// Imported first by the entry points so the time zone applies to every Date.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Event times are wall-clock times in India; the server must agree with that on any host.
process.env.TZ = process.env.TZ || 'Asia/Kolkata'

// Local secrets live in a git-ignored server/.env file (copy .env.example).
const here = path.dirname(fileURLToPath(import.meta.url))
const envFile = path.join(here, '..', '.env')
if (fs.existsSync(envFile) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envFile)
}

const env = process.env

export const config = {
  port: Number(env.PORT || 8080),
  production: env.NODE_ENV === 'production',
  /** Empty = start a local MongoDB automatically (development only). */
  mongoUri: env.MONGODB_URI || '',
  jwtSecret: env.JWT_SECRET || '',
  jwtExpiry: '24h',
  publicUrl: env.PUBLIC_URL || 'http://localhost:5173',
  corsOrigins: (env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(','),
  seed: {
    enabled: (env.SEED_ENABLED ?? 'true') === 'true',
    password: env.SEED_PASSWORD || 'Demo@1234',
  },
  mail: {
    enabled: env.MAIL_ENABLED === 'true',
    user: env.MAIL_USERNAME || '',
    pass: env.MAIL_PASSWORD || '',
    from: env.MAIL_USERNAME || 'no-reply@eventsystem.local',
  },
}

export function assertConfig() {
  if (!config.jwtSecret || config.jwtSecret.length < 32) {
    throw new Error('JWT_SECRET is missing or shorter than 32 characters. Set it in server/.env or the environment.')
  }
  if (config.production && !config.mongoUri) {
    throw new Error('MONGODB_URI is required in production.')
  }
}
