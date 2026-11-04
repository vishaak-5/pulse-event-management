// Fills an empty database with demo accounts, events, registrations and feedback
// so every dashboard has something to show. Runs only when there are no users.
import Event from './models/event.js'
import Feedback from './models/feedback.js'
import Registration from './models/registration.js'
import User from './models/user.js'
import { hashPassword } from './services/users.js'
import { recountSeats } from './services/seats.js'

const DAY = 86_400_000

/** Local date `days` from today at hh:mm. */
function at(days, hh, mm) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hh, mm, 0, 0)
  return d
}

export async function seedIfEmpty(password) {
  if (await User.estimatedDocumentCount() > 0) return false
  const passwordHash = await hashPassword(password)
  const user = (name, email, role) => User.create({ name, email, passwordHash, role })

  await user('Admin', 'admin@pulse.local', 'ADMIN')
  const org = await user('Priya Organizer', 'organizer@pulse.local', 'ORGANIZER')
  const org2 = await user('Arjun Events Club', 'club@pulse.local', 'ORGANIZER')
  const demo = await user('Demo Attendee', 'attendee@pulse.local', 'ATTENDEE')
  const crowd = []
  for (const n of ['Kavya', 'Rahul', 'Sneha', 'Vikram', 'Ananya', 'Karthik', 'Meera', 'Rohan']) {
    crowd.push(await user(n, `${n.toLowerCase()}@pulse.local`, 'ATTENDEE'))
  }

  const event = (organizer, title, category, venue, days, [hh, mm], hours, capacity, status, description) => {
    const startAt = at(days, hh, mm)
    return Event.create({
      organizer: organizer._id, title, category, venue, startAt,
      endAt: new Date(startAt.getTime() + hours * 3_600_000), capacity, status, description,
    })
  }
  /** A registration made `daysAgo` days ago (sign-up history for the charts). */
  const seat = (e, u, status, daysAgo, extra = {}) => {
    const when = new Date(Date.now() - daysAgo * DAY)
    when.setHours(9 + (u._id % 10))
    return Registration.create({ event: e._id, user: u._id, status, createdAt: when, queuedAt: when, ...extra })
  }

  const hack = await event(org, 'Build Night: 24h Hackathon', 'TECH', 'Innovation Lab, Block C', 6, [9, 0], 24, 120,
    'APPROVED', 'Teams of up to four build anything that ships in 24 hours. Mentors on the floor all night, '
    + 'food every four hours, and demos judged by alumni from product teams.')
  const music = await event(org2, 'Neon Courtyard: Live Indie Night', 'MUSIC', 'Open Air Theatre', 10, [18, 30], 4,
    300, 'APPROVED', 'Five campus bands, one stage, and a light show built by the media club. Bring friends.')
  const workshop = await event(org, 'Hands-on: MERN Stack in a Day', 'WORKSHOP', 'Seminar Hall 2', 3, [10, 0], 6, 3,
    'APPROVED', 'Build and deploy a MongoDB, Express, React and Node.js app from scratch. Laptops required. '
    + 'Seats are deliberately limited.')
  await event(org2, 'Inter-College Football Cup', 'SPORTS', 'Main Ground', 14, [7, 30], 10, 500, 'APPROVED',
    'Sixteen colleges, knockout format, finals under the floodlights.')
  await event(org, "Founders' Fireside: Zero to First Customer", 'BUSINESS', 'Auditorium', 20, [16, 0], 2, 200,
    'PENDING', 'Three student founders on finding their first paying customers. Q&A afterwards.')
  const past = await event(org, 'Design Systems Meetup', 'TECH', 'Seminar Hall 1', -2, [15, 0], 3, 40, 'APPROVED',
    'Talks on tokens, motion and accessibility, followed by a portfolio review.')

  // Workshop: 3 seats, all taken, plus a waitlist - shows the waitlist flow.
  // Seats went to people with a history of skipping events, so the turnout
  // forecast suggests releasing a seat to the waitlist.
  await seat(workshop, crowd[5], 'CONFIRMED', 5)
  await seat(workshop, crowd[6], 'CONFIRMED', 4)
  await seat(workshop, crowd[7], 'CONFIRMED', 4)
  await seat(workshop, crowd[0], 'WAITLISTED', 2)
  await seat(workshop, crowd[1], 'WAITLISTED', 1)

  await event(org2, 'Open Source Saturday: First PR Sprint', 'TECH', 'Lab 4, CSE Block', 8, [10, 0], 5, 60,
    'APPROVED', 'Pick a beginner-friendly issue, pair with a maintainer, and ship your first pull request by lunch.')

  // A second past event with real no-shows: history for the turnout forecast.
  const walk = await event(org2, 'Campus Photo Walk', 'CULTURAL', 'Main Gate', -12, [7, 0], 2, 30, 'APPROVED',
    'Golden-hour walk across campus with the photography club.')
  for (const i of [0, 1, 3]) {
    await seat(walk, crowd[i], 'CHECKED_IN', 16, { checkedInAt: new Date(walk.startAt.getTime() + 4 * i * 60_000) })
  }
  for (const i of [5, 6, 7]) await seat(walk, crowd[i], 'CONFIRMED', 15)

  // Hackathon and music night: spread-out sign-ups for the analytics chart.
  for (let i = 0; i < crowd.length; i++) await seat(hack, crowd[i], 'CONFIRMED', 9 - i)
  await seat(hack, demo, 'CONFIRMED', 2)
  for (let i = 2; i < crowd.length; i++) await seat(music, crowd[i], 'CONFIRMED', 7 - Math.floor(i / 2))

  // Past meetup: check-ins and ratings.
  const ratings = [5, 4, 5, 3, 4, 5]
  const comments = ['Loved the motion talk!', 'Great speakers, room was a bit warm.', 'Super useful.',
    null, 'Would come again.', 'Best meetup this semester.']
  for (let i = 0; i < ratings.length; i++) {
    await seat(past, crowd[i], 'CHECKED_IN', 10 - i, { checkedInAt: new Date(past.startAt.getTime() + 5 * i * 60_000) })
    await Feedback.create({
      event: past._id, user: crowd[i]._id, rating: ratings[i], comment: comments[i],
      createdAt: new Date(past.endAt.getTime() + (i + 1) * 3_600_000),
    })
  }
  await seat(past, crowd[6], 'CONFIRMED', 6)
  await seat(past, demo, 'CHECKED_IN', 5, { checkedInAt: new Date(past.startAt.getTime() + 12 * 60_000) })
  await Feedback.create({
    event: past._id, user: demo._id, rating: 5, comment: 'The token talk changed how I build UIs.',
    createdAt: new Date(past.endAt.getTime() + 2 * 3_600_000),
  })

  for (const e of await Event.find({}, { _id: 1 }).lean()) await recountSeats(e._id)
  console.log('Seeded demo data. Sign in with admin@pulse.local, organizer@pulse.local or attendee@pulse.local '
    + '(password from SEED_PASSWORD).')
  return true
}
