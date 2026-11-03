import type {
  AdminStats, Attendee, AuthResponse, Category, CertificateView, CheckInEvent, CheckInResult, EventAnalytics,
  EventRequest, EventStatus, EventView, Feedback, LiveSnapshot, OrganizerOverview, PublicStats, Recommendation, Role,
  SeatCounts, Ticket, User,
} from './types'

const TOKEN_KEY = 'pulse.token'

/**
 * Where the backend lives. Empty in development (Vite proxies /api to it);
 * set VITE_API_URL at build time when the backend is on another host.
 * A bare host (as Render passes between services) means https.
 */
const RAW_API = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '')
const API = RAW_API && !/^https?:\/\//.test(RAW_API) ? `https://${RAW_API}` : RAW_API
const apiUrl = (path: string) => `${API}/api${path}`

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage unavailable - session-only login */
  }
}

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Fired when the server rejects our token, so the auth layer can sign out. */
export const UNAUTHORIZED_EVENT = 'pulse:unauthorized'

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(apiUrl(path), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Is the backend running?')
  }

  if (res.status === 401 && token) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
  if (res.status === 204) return undefined as T

  const text = await res.text()
  const data: unknown = text ? safeJson(text) : undefined
  if (!res.ok) {
    const message = (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string')
      ? data.error
      : friendlyStatus(res.status)
    throw new ApiError(res.status, message)
  }
  // Any successful change may affect what cached reads would show.
  if (method !== 'GET') cache.clear()
  return data as T
}

/** Plain-language fallback when the server sends no message of its own. */
function friendlyStatus(status: number): string {
  if (status === 401) return 'Your session has ended. Please sign in again.'
  if (status === 403) return "You don't have access to that."
  if (status === 404) return 'That page or item no longer exists.'
  if (status === 409) return 'That conflicts with something that already exists.'
  if (status === 429) return 'Too many attempts. Please wait a moment and try again.'
  if (status >= 500) return 'Something went wrong on our side. Please try again.'
  return 'That request could not be completed. Please try again.'
}

/*
 * Short-lived read cache: going back to a list within 15 s renders instantly
 * instead of refetching. Keyed per signed-in user; cleared by any write.
 * Pages where exact numbers matter (event detail, dashboards) are not cached.
 */
const CACHE_TTL = 15_000
const cache = new Map<string, { at: number; value: Promise<unknown> }>()

function cachedGet<T>(path: string): Promise<T> {
  const key = `${getToken() ?? 'guest'} ${path}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.value as Promise<T>
  const value = request<T>('GET', path)
  cache.set(key, { at: Date.now(), value })
  value.catch(() => cache.delete(key)) // never cache a failure
  return value
}

export function clearApiCache() {
  cache.clear()
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function qs(params: Record<string, string | boolean | undefined>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const api = {
  // auth
  login: (email: string, password: string) => request<AuthResponse>('POST', '/auth/login', { email, password }),
  register: (name: string, email: string, password: string, role: Role) =>
    request<AuthResponse>('POST', '/auth/register', { name, email, password, role }),
  me: () => request<User>('GET', '/auth/me'),

  // public
  events: (q?: string, category?: Category, includePast?: boolean) =>
    cachedGet<EventView[]>(`/events${qs({ q, category, includePast: includePast || undefined })}`),
  // Always fresh: the seat count on this page must be exact.
  event: (id: number) => request<EventView>('GET', `/events/${id}`),
  eventFeedback: (id: number) => cachedGet<Feedback[]>(`/events/${id}/feedback`),
  publicStats: () => cachedGet<PublicStats>('/stats/public'),

  // attendee
  registerFor: (eventId: number) => request<Ticket>('POST', `/attendee/events/${eventId}/register`),
  cancelRegistration: (eventId: number) => request<Ticket>('DELETE', `/attendee/events/${eventId}/register`),
  myTicketFor: (eventId: number) => request<Ticket | undefined>('GET', `/attendee/events/${eventId}/ticket`),
  myTickets: () => request<Ticket[]>('GET', '/attendee/tickets'),
  submitFeedback: (eventId: number, rating: number, comment: string) =>
    request<Feedback>('POST', `/attendee/events/${eventId}/feedback`, { rating, comment }),

  // organizer
  overview: () => request<OrganizerOverview>('GET', '/organizer/overview'),
  myEvents: () => request<EventView[]>('GET', '/organizer/events'),
  createEvent: (e: EventRequest) => request<EventView>('POST', '/organizer/events', e),
  updateEvent: (id: number, e: EventRequest) => request<EventView>('PUT', `/organizer/events/${id}`, e),
  cancelEvent: (id: number) => request<EventView>('POST', `/organizer/events/${id}/cancel`),
  attendees: (id: number) => request<Attendee[]>('GET', `/organizer/events/${id}/attendees`),
  analytics: (id: number) => request<EventAnalytics>('GET', `/organizer/events/${id}/analytics`),
  checkIn: (ticketCode: string, eventId?: number) =>
    request<CheckInResult>('POST', '/organizer/checkin', { ticketCode, eventId }),
  releaseSeats: (id: number, seats: number) =>
    request<EventView>('POST', `/organizer/events/${id}/release-seats`, { seats }),
  liveSnapshot: (id: number) => request<LiveSnapshot>('GET', `/organizer/events/${id}/live/snapshot`),
  recommendations: () => request<Recommendation[]>('GET', '/attendee/recommendations'),
  verifyCertificate: (code: string) => request<CertificateView>('GET', `/certificates/${encodeURIComponent(code)}`),

  // admin
  adminStats: () => request<AdminStats>('GET', '/admin/stats'),
  adminEvents: (status?: EventStatus) => request<EventView[]>('GET', `/admin/events${qs({ status })}`),
  approve: (id: number) => request<EventView>('POST', `/admin/events/${id}/approve`),
  reject: (id: number, reason: string) => request<EventView>('POST', `/admin/events/${id}/reject`, { reason }),
  users: () => request<User[]>('GET', '/admin/users'),
  updateUser: (id: number, patch: { enabled?: boolean; role?: Role }) =>
    request<User>('PATCH', `/admin/users/${id}`, patch),
}

/**
 * Reads a Server-Sent Events stream and calls onEvent(name, data) per event.
 * Uses fetch rather than EventSource so a token can travel in a header, never
 * in the URL. Resolves when the stream ends; abort the signal to close it.
 */
async function streamSse(path: string, onEvent: (name: string, data: string) => void, signal: AbortSignal,
  withAuth: boolean): Promise<void> {
  const headers: Record<string, string> = { Accept: 'text/event-stream' }
  if (withAuth) headers.Authorization = `Bearer ${getToken() ?? ''}`
  const res = await fetch(apiUrl(path), { headers, signal })
  if (!res.ok || !res.body) throw new ApiError(res.status, 'Could not open the live stream.')
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return
    buffer += value
    let cut: number
    while ((cut = buffer.search(/\r?\n\r?\n/)) >= 0) {
      const frame = buffer.slice(0, cut)
      buffer = buffer.slice(cut).replace(/^\r?\n\r?\n/, '')
      let name = 'message'
      const data: string[] = []
      for (const line of frame.split(/\r?\n/)) {
        if (line.startsWith('event:')) name = line.slice(6).trim()
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
      }
      if (data.length) onEvent(name, data.join('\n'))
    }
  }
}

/** Organizer's live wall: one callback per check-in. */
export function streamCheckIns(eventId: number, onCheckIn: (e: CheckInEvent) => void, signal: AbortSignal) {
  return streamSse(`/organizer/events/${eventId}/live`,
    (name, data) => { if (name === 'checkin') onCheckIn(JSON.parse(data) as CheckInEvent) }, signal, true)
}

/** Public seat counts for an event page. */
export function streamSeats(eventId: number, onSeats: (s: SeatCounts) => void, signal: AbortSignal) {
  return streamSse(`/events/${eventId}/stream`,
    (name, data) => { if (name === 'seats') onSeats(JSON.parse(data) as SeatCounts) }, signal, false)
}

/** Downloads the attendee's participation certificate PDF. */
export async function downloadCertificate(registrationId: number, title: string): Promise<void> {
  const res = await fetch(apiUrl(`/attendee/tickets/${registrationId}/certificate`), {
    headers: { Authorization: `Bearer ${getToken() ?? ''}` },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string } | null
    throw new ApiError(res.status, body?.error ?? 'Could not create the certificate.')
  }
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = `Certificate - ${title}.pdf`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Fetches the ticket QR (needs the auth header, so no plain <img src>) as an object URL. */
export async function fetchQrUrl(registrationId: number): Promise<string> {
  const res = await fetch(apiUrl(`/attendee/tickets/${registrationId}/qr`), {
    headers: { Authorization: `Bearer ${getToken() ?? ''}` },
  })
  if (!res.ok) throw new ApiError(res.status, 'Could not load the QR code.')
  return URL.createObjectURL(await res.blob())
}
