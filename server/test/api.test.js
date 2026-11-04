// End-to-end API tests against a real (in-memory) MongoDB.
import './env.js'
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import Event from '../src/models/event.js'
import Registration from '../src/models/registration.js'
import User from '../src/models/user.js'
import { normalizeAddress } from '../src/lib/address.js'
import { showRate } from '../src/services/forecast.js'
import { hashPassword } from '../src/services/users.js'
import { api, localIn, signUp, startDb, stopDb } from './helpers.js'

before(startDb)
after(stopDb)

async function adminAuth() {
  await User.create({ name: 'Root', email: 'root@test.local', passwordHash: await hashPassword('Admin@1234'), role: 'ADMIN' })
  const res = await api.post('/api/auth/login').send({ email: 'root@test.local', password: 'Admin@1234' }).expect(200)
  return `Bearer ${res.body.token}`
}

const eventBody = (over = {}) => ({
  title: 'Test Night', description: 'desc', category: 'TECH', venue: 'Hall',
  startAt: localIn(48), endAt: localIn(50), capacity: 2, ...over,
})

describe('registration lifecycle', () => {
  test('create, approve, fill, waitlist, cancel, promote, check in, forecast, release, recommend', async () => {
    const admin = await adminAuth()
    const { auth: organizer } = await signUp('ORGANIZER')
    const { auth: alice } = await signUp('ATTENDEE')
    const { auth: bob } = await signUp('ATTENDEE')
    const { auth: carol } = await signUp('ATTENDEE')

    // Organizer creates a 2-seat event; it starts PENDING and is closed for registration.
    const created = await api.post('/api/organizer/events').set('Authorization', organizer).send(eventBody()).expect(201)
    const id = created.body.id
    assert.equal(created.body.status, 'PENDING')
    await api.post(`/api/attendee/events/${id}/register`).set('Authorization', alice).expect(400)

    // Attendees cannot reach organizer or admin endpoints.
    await api.post(`/api/admin/events/${id}/approve`).set('Authorization', alice).expect(403)
    await api.post(`/api/admin/events/${id}/approve`).set('Authorization', admin).expect(200)

    // Two seats fill, the third attendee is waitlisted at position 1.
    const a = (await api.post(`/api/attendee/events/${id}/register`).set('Authorization', alice).expect(200)).body
    await api.post(`/api/attendee/events/${id}/register`).set('Authorization', bob).expect(200)
    const c = (await api.post(`/api/attendee/events/${id}/register`).set('Authorization', carol).expect(200)).body
    assert.equal(a.status, 'CONFIRMED')
    assert.equal(c.status, 'WAITLISTED')
    assert.equal(c.waitlistPosition, 1)
    assert.equal(c.ticketCode, null)

    // Duplicate registration is rejected.
    const dup = await api.post(`/api/attendee/events/${id}/register`).set('Authorization', alice).expect(409)
    assert.equal(dup.body.error, 'You are already registered for this event.')

    // Bob cancels -> Carol is promoted automatically.
    await api.delete(`/api/attendee/events/${id}/register`).set('Authorization', bob).expect(200)
    const carolNow = await api.get(`/api/attendee/events/${id}/ticket`).set('Authorization', carol).expect(200)
    assert.equal(carolNow.body.status, 'CONFIRMED')

    // Check-in with Alice's ticket works once, then reports a duplicate.
    await api.post('/api/organizer/checkin').set('Authorization', organizer).send({ ticketCode: a.ticketCode }).expect(200)
    const again = await api.post('/api/organizer/checkin').set('Authorization', organizer)
      .send({ ticketCode: a.ticketCode }).expect(409)
    assert.match(again.body.error, /already checked in/)

    // QR image is served for a seat-holding ticket.
    const qr = await api.get(`/api/attendee/tickets/${a.id}/qr`).set('Authorization', alice).expect(200)
    assert.equal(qr.headers['content-type'], 'image/png')

    // Feedback is not allowed before the event starts.
    await api.post(`/api/attendee/events/${id}/feedback`).set('Authorization', alice).send({ rating: 5 }).expect(400)

    // Analytics reflect it all; the forecast counts Alice fully and Carol at the 0.85 prior.
    const stats = (await api.get(`/api/organizer/events/${id}/analytics`).set('Authorization', organizer).expect(200)).body
    assert.equal(stats.confirmed, 1)
    assert.equal(stats.checkedIn, 1)
    assert.equal(stats.cancelled, 1)
    assert.equal(stats.waitlisted, 0)
    assert.ok(Math.abs(stats.expectedAttendance - 1.85) < 1e-6)

    // Public list shows the event with no seats left.
    const list = (await api.get('/api/events').expect(200)).body
    assert.equal(list[0].seatsLeft, 0)
    assert.equal(list[0].registrationsLast24h, 3)

    // No certificate before the event has ended.
    await api.get(`/api/attendee/tickets/${a.id}/certificate`).set('Authorization', alice).expect(400)

    // Live wall snapshot reflects the check-in.
    const snap = (await api.get(`/api/organizer/events/${id}/live/snapshot`).set('Authorization', organizer).expect(200)).body
    assert.equal(snap.checkedIn, 1)
    assert.equal(snap.recent[0].name, 'User')

    // A new attendee lands on the waitlist; releasing one forecast seat promotes them.
    const { auth: dave } = await signUp('ATTENDEE')
    const d = (await api.post(`/api/attendee/events/${id}/register`).set('Authorization', dave).expect(200)).body
    assert.equal(d.status, 'WAITLISTED')
    const released = await api.post(`/api/organizer/events/${id}/release-seats`).set('Authorization', organizer)
      .send({ seats: 1 }).expect(200)
    assert.equal(released.body.capacity, 3)
    const daveNow = await api.get(`/api/attendee/events/${id}/ticket`).set('Authorization', dave).expect(200)
    assert.equal(daveNow.body.status, 'CONFIRMED')

    // Releasing is allowed only once per event.
    await api.post(`/api/organizer/events/${id}/release-seats`).set('Authorization', organizer).send({ seats: 1 }).expect(409)

    // A fresh attendee gets the event recommended, with a reason.
    const { auth: erin } = await signUp('ATTENDEE')
    const recs = (await api.get('/api/attendee/recommendations').set('Authorization', erin).expect(200)).body
    assert.equal(recs[0].event.id, id)
    assert.ok(recs[0].reason.length > 0)
  })

  test('the last seat goes to exactly one of many simultaneous sign-ups', async () => {
    const { auth: organizer } = await signUp('ORGANIZER')
    const ev = await Event.create({ ...eventBody({ title: 'Race', capacity: 3 }), startAt: new Date(Date.now() + 864e5),
      endAt: new Date(Date.now() + 2 * 864e5), organizer: (await api.get('/api/auth/me').set('Authorization', organizer)).body.id,
      status: 'APPROVED' })
    const people = await Promise.all(Array.from({ length: 12 }, () => signUp('ATTENDEE')))
    const results = await Promise.all(people.map((p) => api.post(`/api/attendee/events/${ev._id}/register`)
      .set('Authorization', p.auth)))
    const statuses = results.map((r) => r.body.status)
    assert.equal(statuses.filter((s) => s === 'CONFIRMED').length, 3)
    assert.equal(statuses.filter((s) => s === 'WAITLISTED').length, 9)
    const fresh = await Event.findById(ev._id).lean()
    assert.equal(fresh.seatsTaken, 3)
    assert.equal(await Registration.countDocuments({ event: ev._id, status: 'CONFIRMED' }), 3)
  })
})

describe('event CRUD', () => {
  test('organizer creates, reads, updates and deletes an event', async () => {
    const { auth: organizer } = await signUp('ORGANIZER')
    const { auth: other } = await signUp('ORGANIZER')
    const created = (await api.post('/api/organizer/events').set('Authorization', organizer)
      .send(eventBody({ title: 'CRUD Night' })).expect(201)).body

    const mine = (await api.get('/api/organizer/events').set('Authorization', organizer).expect(200)).body
    assert.ok(mine.some((e) => e.id === created.id))
    // Pending events are hidden from the public but visible to their organizer.
    await api.get(`/api/events/${created.id}`).expect(404)
    await api.get(`/api/events/${created.id}`).set('Authorization', organizer).expect(200)

    const updated = (await api.put(`/api/organizer/events/${created.id}`).set('Authorization', organizer)
      .send(eventBody({ title: 'CRUD Night v2', capacity: 50 })).expect(200)).body
    assert.equal(updated.title, 'CRUD Night v2')
    assert.equal(updated.capacity, 50)

    // Only the owner (or an admin) may change or delete it.
    await api.put(`/api/organizer/events/${created.id}`).set('Authorization', other).send(eventBody()).expect(403)
    await api.delete(`/api/organizer/events/${created.id}`).set('Authorization', other).expect(403)

    await api.delete(`/api/organizer/events/${created.id}`).set('Authorization', organizer).expect(204)
    await api.get(`/api/events/${created.id}`).set('Authorization', organizer).expect(404)
    assert.equal(await Event.countDocuments({ _id: created.id }), 0)
  })

  test('capacity cannot drop below the seats already taken', async () => {
    const admin = (await api.post('/api/auth/login').send({ email: 'root@test.local', password: 'Admin@1234' })).body.token
    const auth = `Bearer ${admin}`
    const ev = (await api.post('/api/organizer/events').set('Authorization', auth).send(eventBody({ capacity: 5 })).expect(201)).body
    assert.equal(ev.status, 'APPROVED') // admin events skip the queue
    for (let i = 0; i < 2; i++) {
      const { auth: p } = await signUp('ATTENDEE')
      await api.post(`/api/attendee/events/${ev.id}/register`).set('Authorization', p).expect(200)
    }
    const res = await api.put(`/api/organizer/events/${ev.id}`).set('Authorization', auth)
      .send(eventBody({ capacity: 1 })).expect(400)
    assert.equal(res.body.error, 'Capacity cannot go below the 2 seats already taken.')
  })
})

describe('certificates', () => {
  test('issued once to a checked-in attendee and publicly verifiable', async () => {
    const org = await User.create({ name: 'Org', email: 'org-cert@t.local', passwordHash: 'x', role: 'ORGANIZER' })
    const ev = await Event.create({
      organizer: org._id, title: 'Past Talk', description: 'd', category: 'TECH', venue: 'Hall',
      startAt: new Date(Date.now() - 3 * 864e5), endAt: new Date(Date.now() - 3 * 864e5 + 7_200_000),
      capacity: 10, status: 'APPROVED', seatsTaken: 1,
    })
    const { auth, user } = await signUp('ATTENDEE', 'Asha')
    const reg = await Registration.create({ event: ev._id, user: user.id, status: 'CHECKED_IN',
      checkedInAt: new Date(ev.startAt.getTime() + 300_000) })

    const pdf = await api.get(`/api/attendee/tickets/${reg._id}/certificate`).set('Authorization', auth)
      .buffer(true).parse((res, cb) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))) })
      .expect(200)
    assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF')
    const { certificateCode: code } = await Registration.findById(reg._id).lean()
    assert.ok(code)

    const view = (await api.get(`/api/certificates/${code}`).expect(200)).body
    assert.equal(view.attendeeName, 'Asha')
    assert.equal(view.eventTitle, 'Past Talk')

    // Downloading again keeps the same certificate id; unknown ids are rejected.
    await api.get(`/api/attendee/tickets/${reg._id}/certificate`).set('Authorization', auth).expect(200)
    assert.equal((await Registration.findById(reg._id).lean()).certificateCode, code)
    await api.get('/api/certificates/not-a-real-code').expect(404)

    // Events with checked-in attendees are kept for their certificates.
    const orgLogin = await User.findByIdAndUpdate(org._id, { passwordHash: await hashPassword('Secret@123') })
    const token = (await api.post('/api/auth/login').send({ email: orgLogin.email, password: 'Secret@123' })).body.token
    await api.delete(`/api/organizer/events/${ev._id}`).set('Authorization', `Bearer ${token}`).expect(409)
  })
})

describe('validation and errors', () => {
  test('validation errors read like sentences', async () => {
    const { auth } = await signUp('ORGANIZER')
    const res = await api.post('/api/organizer/events').set('Authorization', auth).send({
      title: '', description: 'd', category: 'TECH', venue: 'Hall',
      startAt: '2020-01-01T10:00:00', endAt: '2020-01-01T12:00:00', capacity: 5,
    }).expect(400)
    assert.match(res.body.error, /Title is required\./)
    assert.match(res.body.error, /Start time must be in the future\./)
    assert.doesNotMatch(res.body.error, /startAt/)
  })

  test('bad input gets a clear message, never a crash', async () => {
    const { auth } = await signUp('ORGANIZER')
    const bad = await api.post('/api/organizer/events').set('Authorization', auth)
      .set('Content-Type', 'application/json').send('{"title": ').expect(400)
    assert.equal(bad.body.error, 'Some of the details entered are not valid. Please check and try again.')

    const sign = await api.post('/api/auth/register')
      .send({ name: 'X', email: 'not-an-email', password: 'short', role: 'ATTENDEE' }).expect(400)
    assert.match(sign.body.error, /Email must be a valid email address\./)
    assert.match(sign.body.error, /Password must be 8-72 characters\./)

    await api.post('/api/auth/register')
      .send({ name: 'X', email: 'x@test.local', password: 'Secret@123', role: 'ADMIN' }).expect(403)
    await api.post('/api/auth/login').send({ email: 'nobody@test.local', password: 'whatever1' }).expect(401)
    await api.get('/api/organizer/overview').expect(401)
    await api.get('/api/events/abc').expect(404)
    await api.get('/api/events?category=NOPE').expect(400)
    await api.get('/api/no-such-route').expect(404)
  })

  test('admins cannot lock themselves out', async () => {
    const token = (await api.post('/api/auth/login').send({ email: 'root@test.local', password: 'Admin@1234' })).body.token
    const me = (await api.get('/api/auth/me').set('Authorization', `Bearer ${token}`)).body
    const res = await api.patch(`/api/admin/users/${me.id}`).set('Authorization', `Bearer ${token}`)
      .send({ enabled: false }).expect(400)
    assert.equal(res.body.error, 'You cannot disable your own account.')
  })
})

describe('helpers', () => {
  test('public addresses are normalised', () => {
    assert.equal(normalizeAddress('pulse-web-solq'), 'https://pulse-web-solq.onrender.com')
    assert.equal(normalizeAddress('example.com/'), 'https://example.com')
    assert.equal(normalizeAddress('http://localhost:5173'), 'http://localhost:5173')
  })

  test('forecast smooths toward the prior', () => {
    assert.ok(Math.abs(showRate(0, 0) - 0.85) < 1e-9)
    assert.ok(Math.abs(showRate(2, 0) - 0.425) < 1e-9)
    assert.ok(Math.abs(showRate(4, 4) - (4 + 1.7) / 6) < 1e-9)
  })
})
