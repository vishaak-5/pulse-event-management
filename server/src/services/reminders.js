import Event from '../models/event.js'
import Registration, { SEAT_HOLDING } from '../models/registration.js'
import User from '../models/user.js'
import { sendEmail } from '../lib/email.js'
import { when } from '../lib/time.js'

const HOUR = 3_600_000

/** Emails every seat holder once, roughly a day before the event starts. */
export async function sendReminders() {
  const now = new Date()
  const due = await Event.find({
    status: 'APPROVED', reminderSent: false, startAt: { $gte: now, $lte: new Date(now.getTime() + 25 * HOUR) },
  }).lean()
  for (const e of due) {
    // Claim the event first so two server instances never both send.
    const claimed = await Event.updateOne({ _id: e._id, reminderSent: false }, { $set: { reminderSent: true } })
    if (!claimed.modifiedCount) continue
    const regs = await Registration.find({ event: e._id, status: { $in: SEAT_HOLDING } }, { user: 1 }).lean()
    const users = await User.find({ _id: { $in: regs.map((r) => r.user) } }, { email: 1 }).lean()
    for (const u of users) {
      sendEmail(u.email, `Tomorrow: ${e.title}`, 'Your event is coming up',
        `Reminder: "${e.title}" starts ${when(e.startAt)} at ${e.venue}.\nKeep your QR ticket ready at the entrance.`)
    }
    console.log(`Sent reminders for event ${e._id} (${e.title})`)
  }
}

/** Runs sendReminders now and then every hour. */
export function startReminders() {
  const run = () => sendReminders().catch((err) => console.warn('Reminder run failed', err.message))
  run()
  const timer = setInterval(run, HOUR)
  timer.unref()
  return timer
}
