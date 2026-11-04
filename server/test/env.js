// Imported first by every test file: the config module reads these on load.
import crypto from 'node:crypto'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = crypto.randomBytes(48).toString('base64')
process.env.SEED_ENABLED = 'false'
