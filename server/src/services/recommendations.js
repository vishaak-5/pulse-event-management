// "Picked for you": ranks upcoming events an attendee has not joined yet.
//
//   score = 2.0 x category affinity   (events booked in that category, plus
//                                       +1.5 per 4-5 star rating, -1 per 1-2 star rating)
//         + 1.5 x popularity          (share of seats already taken)
//         + 1.0 / 0.5 if within 7 / 14 days
//         - 1.0 if the event is full (only the waitlist is open)
//
// Every pick carries a one-line reason built from the strongest signal,
// so the suggestion is explainable rather than a black box.
import Event from '../models/event.js'
import Feedback from '../models/feedback.js'
import Registration from '../models/registration.js'
import { eventViews } from './views.js'

const LIMIT = 3
const DAY = 86_400_000

function reason(e, aff, booked, loved, popularity, days) {
  const cat = e.category.toLowerCase()
  if (aff > 0 && (loved.get(e.category) ?? 0) > 0) return `You rated a ${cat} event highly`
  if (aff > 0) {
    const n = booked.get(e.category) ?? 0
    return `You've booked ${n} ${cat} event${n === 1 ? '' : 's'}`
  }
  if (popularity >= 0.5) return `${Math.round(popularity * 100)}% of seats already taken`
  if (days <= 7) return days === 0 ? 'Happening today' : days === 1 ? 'Happening tomorrow' : `Happening in ${days} days`
  return `New in ${cat}`
}

export async function recommendationsFor(user) {
  const now = Date.now()
  const affinity = new Map()
  const booked = new Map()
  const loved = new Map()
  const add = (map, key, v) => map.set(key, (map.get(key) ?? 0) + v)

  const mine = await Registration.find({ user: user.id, status: { $ne: 'CANCELLED' } }, { event: 1 }).lean()
  const joined = new Set(mine.map((r) => r.event))
  const rated = await Feedback.find({ user: user.id }).lean()
  const related = new Map((await Event.find({ _id: { $in: [...joined, ...rated.map((f) => f.event)] } },
    { category: 1 }).lean()).map((e) => [e._id, e.category]))

  for (const r of mine) {
    add(affinity, related.get(r.event), 1)
    add(booked, related.get(r.event), 1)
  }
  for (const f of rated) {
    const c = related.get(f.event)
    if (f.rating >= 4) {
      add(affinity, c, 1.5)
      add(loved, c, 1)
    } else if (f.rating <= 2) {
      add(affinity, c, -1)
    }
  }

  const open = (await Event.find({ status: 'APPROVED', endAt: { $gt: new Date() } }).sort({ startAt: 1 }).lean())
    .filter((e) => !joined.has(e._id))
  const views = await eventViews(open)
  const picks = open.map((e, i) => {
    const v = views[i]
    const aff = affinity.get(e.category) ?? 0
    const popularity = e.capacity ? v.seatsTaken / e.capacity : 0
    const days = Math.max(0, Math.floor((e.startAt - now) / DAY))
    const soon = days <= 7 ? 1 : days <= 14 ? 0.5 : 0
    const score = 2 * aff + 1.5 * popularity + soon - (v.seatsLeft === 0 ? 1 : 0)
    return { event: v, reason: reason(e, aff, booked, loved, popularity, days), score }
  })
  picks.sort((a, b) => b.score - a.score)
  return picks.slice(0, LIMIT)
}
