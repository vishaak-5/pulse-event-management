// Mirrors the backend DTOs (com.eventsystem.dto.*).

export type Role = 'ADMIN' | 'ORGANIZER' | 'ATTENDEE'
export type EventStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
export type RegistrationStatus = 'CONFIRMED' | 'WAITLISTED' | 'CANCELLED' | 'CHECKED_IN'
export type Category = 'TECH' | 'MUSIC' | 'SPORTS' | 'WORKSHOP' | 'CULTURAL' | 'BUSINESS' | 'OTHER'

export const CATEGORIES: Category[] = ['TECH', 'MUSIC', 'SPORTS', 'WORKSHOP', 'CULTURAL', 'BUSINESS', 'OTHER']

export interface User {
  id: number
  name: string
  email: string
  role: Role
  enabled: boolean
  createdAt: string
}

export interface AuthResponse {
  token: string
  user: User
}

export interface EventView {
  id: number
  title: string
  description: string
  category: Category
  venue: string
  startAt: string
  endAt: string
  capacity: number
  seatsTaken: number
  seatsLeft: number
  waitlistCount: number
  status: EventStatus
  rejectionReason: string | null
  organizerId: number
  organizerName: string
  averageRating: number | null
  ratingCount: number
  registrationsLast24h: number
}

export interface SeatCounts {
  eventId: number
  capacity: number
  seatsTaken: number
  seatsLeft: number
  waitlistCount: number
  registrationsLast24h: number
}

export interface CertificateView {
  code: string
  attendeeName: string
  eventTitle: string
  category: Category
  venue: string
  startAt: string
  endAt: string
  organizerName: string
  checkedInAt: string
}

export interface EventRequest {
  title: string
  description: string
  category: Category
  venue: string
  startAt: string
  endAt: string
  capacity: number
}

export interface Ticket {
  id: number
  eventId: number
  eventTitle: string
  venue: string
  startAt: string
  endAt: string
  category: Category
  status: RegistrationStatus
  ticketCode: string | null
  waitlistPosition: number | null
  registeredAt: string
  checkedInAt: string | null
  feedbackGiven: boolean
}

export interface Attendee {
  registrationId: number
  userId: number
  name: string
  email: string
  status: RegistrationStatus
  queuedAt: string
  checkedInAt: string | null
  /** Forecast chance of turning up (seat holders only). */
  showRate: number | null
  /** Past events this person held a seat for. */
  pastEvents: number | null
}

export interface Recommendation {
  event: EventView
  reason: string
  score: number
}

export interface Arrival {
  name: string
  at: string
}

export interface LiveSnapshot {
  eventId: number
  title: string
  venue: string
  startAt: string
  capacity: number
  seated: number
  checkedIn: number
  recent: Arrival[]
}

/** Pushed to the live wall on every check-in. */
export interface CheckInEvent {
  eventId: number
  attendeeName: string
  at: string
  checkedIn: number
  seated: number
  capacity: number
}

export interface CheckInResult {
  attendeeName: string
  attendeeEmail: string
  eventTitle: string
  checkedInAt: string
}

export interface Feedback {
  id: number
  userName: string
  rating: number
  comment: string | null
  createdAt: string
}

export interface EventAnalytics {
  eventId: number
  title: string
  capacity: number
  confirmed: number
  checkedIn: number
  waitlisted: number
  cancelled: number
  fillRate: number
  attendanceRate: number
  averageRating: number | null
  ratingCount: number
  ratingDistribution: Record<string, number>
  registrationsByDay: { date: string; count: number }[]
  expectedAttendance: number
  predictedNoShows: number
  suggestedExtraSeats: number
  releasedSeats: number
}

export interface OrganizerOverview {
  totalEvents: number
  upcomingEvents: number
  pendingApproval: number
  totalRegistrations: number
  totalCheckedIn: number
  averageRating: number | null
}

export interface AdminStats {
  usersByRole: Record<Role, number>
  eventsByStatus: Record<EventStatus, number>
  activeRegistrations: number
  checkIns: number
}

export interface PublicStats {
  upcomingEvents: number
  attendees: number
  organizers: number
  ticketsIssued: number
}
