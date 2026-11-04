// Shared test setup: a throwaway in-memory MongoDB and the Express app.
import './env.js'
import crypto from 'node:crypto'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import request from 'supertest'
import { createApp } from '../src/app.js'

let mongo
export const app = createApp()
// One shared listening server, so concurrent test requests reuse it.
const server = app.listen(0)
server.unref()
export const api = request(server)

export async function startDb() {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri('pulse-test'))
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()))
}

export async function stopDb() {
  await mongoose.disconnect()
  await mongo?.stop()
}

/** Signs up a fresh account with the given role; returns {auth, user}. */
export async function signUp(role, name = 'User') {
  const res = await api.post('/api/auth/register')
    .send({ name, email: `${crypto.randomUUID()}@test.local`, password: 'Secret@123', role })
    .expect(201)
  return { auth: `Bearer ${res.body.token}`, user: res.body.user }
}

/** "YYYY-MM-DDTHH:mm:ss" local, `hours` from now. */
export function localIn(hours) {
  const d = new Date(Date.now() + hours * 3_600_000)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
