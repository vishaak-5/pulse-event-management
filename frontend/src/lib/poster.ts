import QRCode from 'qrcode'
import { CATEGORY_HUES, formatFull, titleCase } from './format'
import { eventUrl } from './share'
import type { EventView } from './types'

const W = 1080
const H = 1350

/** Same seeded randomness as EventCover, so the poster matches the event's card art. */
function rand(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = w
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}

/**
 * Renders a 1080x1350 (Instagram portrait) poster for an event, with a QR code
 * that opens the event page, and downloads it as PNG. Runs entirely in the browser.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('QR image failed to load'))
    img.src = src
  })
}

export async function downloadPoster(e: EventView): Promise<void> {
  // Web fonts are normally loaded already; never let a slow font block the download.
  await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))])
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const [h1, h2] = CATEGORY_HUES[e.category]

  // background + glowing orbs in the category's hues
  ctx.fillStyle = '#05070a'
  ctx.fillRect(0, 0, W, H)
  for (let i = 0; i < 3; i++) {
    const x = (0.15 + rand(e.id * 3 + i) * 0.7) * W
    const y = (0.1 + rand(e.id * 7 + i) * 0.45) * H
    const r = (0.35 + rand(e.id * 11 + i) * 0.3) * W
    const hue = i % 2 ? h2 : h1
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `hsla(${hue}, 90%, 60%, 0.55)`)
    g.addColorStop(0.55, `hsla(${hue}, 80%, 40%, 0.12)`)
    g.addColorStop(1, 'hsla(0, 0%, 0%, 0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }
  // contour rings
  ctx.strokeStyle = `hsla(${h1}, 90%, 70%, 0.14)`
  ctx.lineWidth = 2
  const cx = (0.3 + rand(e.id * 13) * 0.4) * W
  const cy = (0.25 + rand(e.id * 17) * 0.15) * H
  for (let r = 80; r <= 560; r += 80) {
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  // bottom fade for legibility
  const fade = ctx.createLinearGradient(0, H * 0.35, 0, H)
  fade.addColorStop(0, 'rgba(5,7,10,0)')
  fade.addColorStop(0.55, 'rgba(5,7,10,0.9)')
  fade.addColorStop(1, 'rgba(5,7,10,1)')
  ctx.fillStyle = fade
  ctx.fillRect(0, 0, W, H)

  const pad = 84
  // brand
  ctx.strokeStyle = '#5ef2b0'
  ctx.lineWidth = 6
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  const bx = pad
  const by = pad + 20
  ;[[0, 0], [22, 0], [34, -24], [54, 28], [66, 6], [90, 6]].forEach(([dx, dy], i) =>
    i === 0 ? ctx.moveTo(bx + dx, by + dy) : ctx.lineTo(bx + dx, by + dy))
  ctx.stroke()
  ctx.fillStyle = '#e9eff5'
  ctx.font = '600 40px "Inter Tight", sans-serif'
  ctx.fillText('pulse', bx + 110, by + 16)

  // category pill
  ctx.font = '600 26px "Inter Tight", sans-serif'
  const label = titleCase(e.category).toUpperCase()
  const pw = ctx.measureText(label).width + 48
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(W - pad - pw, pad - 8, pw, 56, 28)
  ctx.stroke()
  ctx.fillStyle = '#e9eff5'
  ctx.fillText(label, W - pad - pw + 24, pad + 29)

  // title
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 92px "Inter Tight", sans-serif'
  const lines = wrap(ctx, e.title, W - pad * 2).slice(0, 4)
  let y = 720 - (lines.length - 1) * 98
  for (const l of lines) {
    ctx.fillText(l, pad, y)
    y += 98
  }

  // italic accent line
  ctx.fillStyle = '#5ef2b0'
  ctx.font = 'italic 56px "Instrument Serif", serif'
  ctx.fillText(e.seatsLeft > 0 ? `${e.seatsLeft} seats left. Free entry.` : 'Join the waitlist.', pad, y + 10)

  // details
  ctx.fillStyle = '#c4cfdb'
  ctx.font = '500 36px "Inter Tight", sans-serif'
  ctx.fillText(formatFull(e.startAt), pad, H - 250)
  ctx.fillStyle = '#97a5b6'
  ctx.fillText(e.venue, pad, H - 200)
  ctx.font = '400 28px "Inter Tight", sans-serif'
  ctx.fillText(`Hosted by ${e.organizerName}`, pad, H - 150)

  // QR code to the event page
  const qr = await QRCode.toDataURL(eventUrl(e), { margin: 1, width: 220, color: { dark: '#05070a', light: '#ffffff' } })
  const img = await loadImage(qr)
  const qs = 220
  const qx = W - pad - qs
  const qy = H - pad - qs - 34
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.roundRect(qx - 14, qy - 14, qs + 28, qs + 28, 22)
  ctx.fill()
  ctx.drawImage(img, qx, qy, qs, qs)
  ctx.fillStyle = '#97a5b6'
  ctx.font = '500 24px "Inter Tight", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Scan to register', qx + qs / 2, qy + qs + 54)

  const url = canvas.toDataURL('image/png')
  const a = document.createElement('a')
  a.href = url
  a.download = `${e.title.replace(/[^\w\s-]/g, '').trim() || 'event'} - poster.png`
  a.click()
}
