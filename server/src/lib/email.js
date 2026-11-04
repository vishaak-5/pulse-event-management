import nodemailer from 'nodemailer'
import { config } from '../config.js'

const transport = config.mail.enabled
  ? nodemailer.createTransport({ service: 'gmail', auth: { user: config.mail.user, pass: config.mail.pass } })
  : null

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ENTITIES[c])

function html(heading, body) {
  return `<div style="font-family:Segoe UI,Arial,sans-serif;background:#07090d;padding:32px">
  <div style="max-width:520px;margin:auto;background:#10141b;border:1px solid #1f2733;border-radius:16px;padding:28px;color:#e6edf3">
    <div style="font-size:12px;letter-spacing:.2em;color:#8bf5c4;text-transform:uppercase">Pulse Events</div>
    <h1 style="font-size:22px;margin:12px 0 16px">${escape(heading)}</h1>
    <p style="font-size:15px;line-height:1.6;color:#b7c2cf">${escape(body).replace(/\n/g, '<br>')}</p>
  </div>
</div>`
}

/**
 * Sends a notification without making the request wait for it. With
 * MAIL_ENABLED unset (the default) the message is only logged.
 */
export function sendEmail(to, subject, heading, body) {
  if (!transport) {
    if (process.env.NODE_ENV !== 'test') console.log(`[email disabled] to=${to} subject="${subject}"`)
    return
  }
  transport.sendMail({ from: config.mail.from, to, subject, html: html(heading, body) })
    .then(() => console.log(`Email sent to ${to}: ${subject}`))
    .catch((e) => console.warn(`Could not send email to ${to}: ${e.message}`))
}
