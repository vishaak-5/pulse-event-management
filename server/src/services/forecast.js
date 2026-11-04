// Estimates how likely each seat holder is to actually turn up, from their own
// history: of the seats they held at past events, how many did they check in to?
//
// The rate is smoothed toward a prior so one missed event does not brand a
// newcomer as unreliable:  showRate = (shows + PRIOR * WEIGHT) / (held + WEIGHT).
// With no history the estimate is simply PRIOR.
import Registration, { SEAT_HOLDING } from '../models/registration.js'

/** Typical turnout for free campus events with confirmed seats. */
export const PRIOR = 0.85
/** How many "imaginary" past events the prior is worth. */
export const WEIGHT = 2

export const showRate = (held, shows) => (shows + PRIOR * WEIGHT) / (held + WEIGHT)

/**
 * Map userId -> {showRate, pastEvents, pastShows}. History counts seats held at
 * other approved events that have already ended. One aggregation with a $lookup
 * joins each registration to its event.
 */
export async function estimateShowRates(eventId, userIds) {
  const result = new Map()
  if (!userIds.length) return result
  const rows = await Registration.aggregate([
    { $match: { user: { $in: userIds }, event: { $ne: eventId }, status: { $in: SEAT_HOLDING } } },
    { $lookup: { from: 'events', localField: 'event', foreignField: '_id', as: 'ev' } },
    { $unwind: '$ev' },
    { $match: { 'ev.status': 'APPROVED', 'ev.endAt': { $lt: new Date() } } },
    {
      $group: {
        _id: '$user',
        held: { $sum: 1 },
        shows: { $sum: { $cond: [{ $eq: ['$status', 'CHECKED_IN'] }, 1, 0] } },
      },
    },
  ])
  const history = new Map(rows.map((r) => [r._id, r]))
  for (const id of userIds) {
    const h = history.get(id) ?? { held: 0, shows: 0 }
    result.set(id, { showRate: showRate(h.held, h.shows), pastEvents: h.held, pastShows: h.shows })
  }
  return result
}
