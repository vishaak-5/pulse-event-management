import type { Category } from './types'

const dateFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
const timeFmt = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' })
const fullFmt = new Intl.DateTimeFormat('en-IN', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit',
})

export const formatDate = (iso: string) => dateFmt.format(new Date(iso))
export const formatTime = (iso: string) => timeFmt.format(new Date(iso))
export const formatFull = (iso: string) => fullFmt.format(new Date(iso))
export function formatRange(start: string, end: string): string {
  const sameDay = new Date(start).toDateString() === new Date(end).toDateString()
  return sameDay
    ? `${formatDate(start)} · ${formatTime(start)} – ${formatTime(end)}`
    : `${formatDate(start)} ${formatTime(start)} – ${formatDate(end)} ${formatTime(end)}`
}

export function relativeDay(iso: string): string {
  const days = Math.round((new Date(iso).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  return days > 0 ? `In ${days} days` : `${-days} days ago`
}

export const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ')

export const percent = (x: number) => `${Math.round(x * 100)}%`

/** Value for <input type="datetime-local"> from an ISO string, and back. */
export const toLocalInput = (iso: string) => iso.slice(0, 16)
export const fromLocalInput = (v: string) => (v.length === 16 ? `${v}:00` : v)

/** Each category gets a hue pair for its generative cover art. */
export const CATEGORY_HUES: Record<Category, [number, number]> = {
  TECH: [152, 190],
  MUSIC: [280, 330],
  SPORTS: [28, 55],
  WORKSHOP: [195, 160],
  CULTURAL: [340, 20],
  BUSINESS: [215, 250],
  OTHER: [100, 150],
}
