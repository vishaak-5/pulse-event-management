// Participation certificates for attendees who were checked in at an event.
// Each certificate carries a unique code and a QR code pointing to the public
// verification page, so anyone can confirm it was really issued by Pulse.
import crypto from 'node:crypto'
import PDFDocument from 'pdfkit'
import Event from '../models/event.js'
import Registration from '../models/registration.js'
import User from '../models/user.js'
import { config } from '../config.js'
import { normalizeAddress } from '../lib/address.js'
import { badRequest, notFound } from '../lib/errors.js'
import { qrPng } from '../lib/qr.js'
import { toLocal } from '../lib/time.js'

const NAVY = '#1F3864'
const MINT = '#2FD99A'
const GREY = '#595959'
const PAPER = '#FBFCFE'
const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

/** Issues (once) and renders the caller's certificate for a registration. */
export async function certificatePdf(registrationId, user) {
  const reg = await Registration.findOne({ _id: registrationId, user: user.id }).lean()
  if (!reg) throw notFound('Registration')
  if (reg.status !== 'CHECKED_IN') throw badRequest('Certificates are only issued to attendees who were checked in.')
  const event = await Event.findById(reg.event).lean()
  if (event.endAt > new Date()) throw badRequest('Your certificate will be available once the event ends.')

  // Set the code only if there is none yet, so every download shows the same id.
  await Registration.updateOne({ _id: reg._id, certificateCode: { $exists: false } },
    { $set: { certificateCode: crypto.randomUUID() } })
  const { certificateCode } = await Registration.findById(reg._id, { certificateCode: 1 }).lean()
  const [attendee, organizer] = await Promise.all([User.findById(reg.user).lean(), User.findById(event.organizer).lean()])
  return render({ code: certificateCode, attendee: attendee.name, event, organizer: organizer?.name ?? 'Organizer' })
}

/** Public check behind the QR code printed on every certificate. */
export async function verifyCertificate(code) {
  const reg = await Registration.findOne({ certificateCode: code.trim() }).lean()
  if (!reg) throw notFound('Certificate')
  const event = await Event.findById(reg.event).lean()
  const [attendee, organizer] = await Promise.all([User.findById(reg.user).lean(), User.findById(event.organizer).lean()])
  return {
    code: reg.certificateCode,
    attendeeName: attendee.name,
    eventTitle: event.title,
    category: event.category,
    venue: event.venue,
    startAt: toLocal(event.startAt),
    endAt: toLocal(event.endAt),
    organizerName: organizer?.name ?? 'Organizer',
    checkedInAt: toLocal(reg.checkedInAt),
  }
}

async function render({ code, attendee, event, organizer }) {
  const doc = new PDFDocument({
    size: 'A4', layout: 'landscape', margin: 0,
    info: { Title: `Certificate of Participation - ${event.title}`, Author: 'Pulse - Smart Event Management' },
  })
  const chunks = []
  doc.on('data', (c) => chunks.push(c))
  const finished = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))))

  const w = doc.page.width
  const h = doc.page.height
  /** One line of centred text whose top sits at `top`. */
  const center = (text, font, size, color, top) =>
    doc.font(font).fontSize(size).fillColor(color).text(text, 40, top, { width: w - 80, align: 'center', lineBreak: false })

  // paper, double frame, accent band
  doc.rect(0, 0, w, h).fill(PAPER)
  doc.lineWidth(3).strokeColor(NAVY).rect(26, 26, w - 52, h - 52).stroke()
  doc.lineWidth(0.7).rect(34, 34, w - 68, h - 68).stroke()
  doc.rect(w / 2 - 60, 88, 120, 4).fill(MINT)

  // brand mark: the pulse line
  const bx = w / 2 - 34
  const by = 70
  doc.lineWidth(2.4).strokeColor(MINT)
    .moveTo(bx, by).lineTo(bx + 12, by).lineTo(bx + 20, by - 14).lineTo(bx + 32, by + 14)
    .lineTo(bx + 40, by - 6).lineTo(bx + 52, by).lineTo(bx + 68, by).stroke()

  center('CERTIFICATE OF PARTICIPATION', 'Helvetica-Bold', 26, NAVY, 120)
  center('This is to certify that', 'Times-Italic', 15, GREY, 176)
  center(attendee, 'Times-BoldItalic', 40, NAVY, 214)
  doc.lineWidth(0.6).strokeColor('#BFBFBF').moveTo(w / 2 - 200, 268).lineTo(w / 2 + 200, 268).stroke()
  center('attended and was checked in at', 'Times-Italic', 15, GREY, 280)
  center(event.title, 'Helvetica-Bold', 22, '#000000', 312)
  center(`${DAY.format(event.startAt)}  ·  ${event.venue}`, 'Helvetica', 13, GREY, 346)

  // signature block
  const sy = h - 118
  doc.lineWidth(0.8).strokeColor(NAVY).moveTo(w / 2 - 110, sy).lineTo(w / 2 + 110, sy).stroke()
  center(organizer, 'Helvetica-Bold', 12, NAVY, sy + 8)
  center('Event Organizer', 'Helvetica', 10, GREY, sy + 25)

  // verification QR + code
  const verifyUrl = `${normalizeAddress(config.publicUrl)}/verify/${code}`
  doc.image(await qrPng(verifyUrl, 300), w - 140, h - 56 - 84, { width: 84, height: 84 })
  doc.font('Helvetica').fontSize(8).fillColor(GREY)
    .text('Scan to verify', 0, h - 118, { width: w - 148, align: 'right', lineBreak: false })
  doc.font('Courier').fontSize(7)
    .text(`ID ${code}`, 0, h - 104, { width: w - 148, align: 'right', lineBreak: false })
  doc.font('Helvetica').fontSize(8)
    .text('Pulse  ·  Smart Event Management and Registration System', 56, h - 64, { lineBreak: false })

  doc.end()
  return finished
}
