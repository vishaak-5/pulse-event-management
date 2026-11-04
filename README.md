# Pulse — Smart Event Management and Registration System

Full Stack Development (24CSI013) project · Vishaak R (24BCS314) · Kumaraguru College of Technology

**Live demo:** https://pulse-web-solq.onrender.com (free hosting: the first load after idle can take about a minute)

Organizers publish events, admins approve them, attendees register and get QR
tickets. Full events open a waitlist that promotes people automatically when a
seat frees up. Organizers scan tickets at the door and see live analytics.

Built on the **MERN** stack:

| Layer    | Tech                                                                    |
|----------|-------------------------------------------------------------------------|
| Database | **MongoDB** (Atlas in production) with **Mongoose** schemas and indexes |
| Backend  | **Node.js** + **Express 5** REST API, JWT auth, bcrypt, zod validation  |
| Frontend | **React** 19 + TypeScript, Vite, Tailwind CSS 4, react-spring           |
| 3D / UI  | Three.js via @react-three/fiber (custom GLSL hero), Recharts            |
| Extras   | Server-Sent Events (live updates), qrcode, pdfkit, nodemailer           |

## Project structure

```
server/                 Express + MongoDB API
  src/config.js         environment settings
  src/app.js            middleware, routes, error handler
  src/index.js          entry point: connect DB, seed, listen
  src/models/           Mongoose schemas: User, Event, Registration, Feedback, Counter
  src/routes/           auth, public, attendee, organizer, admin routers
  src/services/         business logic (events, registrations, seats, stats, forecast, ...)
  src/middleware/       JWT authentication and role guards
  src/lib/              validation, errors, email, QR, live (SSE), time helpers
  test/                 API tests (node:test + supertest + in-memory MongoDB)
frontend/               React app (Vite)
render.yaml             one-click deployment (Render Blueprint)
```

## Run it locally

Needs only **Node.js 20+**. No database install is required: with `MONGODB_URI` unset the API starts a
private local MongoDB automatically and keeps its data in `server/.data/`.

1. **Backend:** `start-backend.cmd` (or `cd server && npm install && npm start`) → http://localhost:8080.
   The first run creates `server/.env` with a random JWT key, and demo data is seeded into the empty database.
2. **Frontend:** `start-frontend.cmd` (or `cd frontend && npm install && npm run dev`) → http://localhost:5173

To use your own MongoDB instead, put `MONGODB_URI=mongodb://...` in `server/.env` (see `server/.env.example`).

## Database design (MongoDB collections)

| Collection      | Key fields                                                                                      | Indexes |
|-----------------|-------------------------------------------------------------------------------------------------|---------|
| `users`         | name, email, passwordHash, role (ADMIN / ORGANIZER / ATTENDEE), enabled, createdAt              | email (unique) |
| `events`        | title, description, category, venue, startAt, endAt, capacity, **seatsTaken**, status, rejectionReason, organizer → users, releasedSeats, reminderSent | status + startAt, organizer |
| `registrations` | event → events, user → users, status (CONFIRMED / WAITLISTED / CANCELLED / CHECKED_IN), ticketCode, queuedAt, checkedInAt, certificateCode | event + user (unique), ticketCode (unique), certificateCode (unique, sparse), event + status + queuedAt |
| `feedback`      | event → events, user → users, rating 1–5, comment, createdAt                                     | event + user (unique) |
| `counters`      | one sequence per collection, for readable numeric ids (`/events/12`)                             | — |

**No overselling:** a seat is taken with one atomic, conditional update —
`findOneAndUpdate({ _id, status: 'APPROVED', $expr: { $lt: ['$seatsTaken', '$capacity'] } }, { $inc: { seatsTaken: 1 } })`.
When many people try for the last seat at the same moment, exactly one update matches; everyone else is
waitlisted. A test fires 12 simultaneous sign-ups at a 3-seat event and checks that exactly 3 are confirmed.

## CRUD operations

| Operation | Event (organizer)                     | Registration (attendee)                    | User (admin)               |
|-----------|---------------------------------------|--------------------------------------------|----------------------------|
| Create    | `POST /api/organizer/events`          | `POST /api/attendee/events/:id/register`   | `POST /api/auth/register`  |
| Read      | `GET /api/events`, `/api/events/:id`  | `GET /api/attendee/tickets`                | `GET /api/admin/users`     |
| Update    | `PUT /api/organizer/events/:id`       | check-in: `POST /api/organizer/checkin`    | `PATCH /api/admin/users/:id` |
| Delete    | `DELETE /api/organizer/events/:id`    | `DELETE /api/attendee/events/:id/register` | (disable via PATCH)        |

## Deploy (free: Render + MongoDB Atlas)

1. **Database:** create a free **M0** cluster on [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
   Add a database user, allow network access from `0.0.0.0/0`, and copy the `mongodb+srv://` connection
   string (add `/pulse` before the `?` so the data goes into a database named `pulse`).
2. **App:** on [Render](https://render.com) choose **New → Blueprint** and pick this repository. `render.yaml`
   creates `pulse-api` (Docker, Node 22) and `pulse-web` (static site). When asked, enter `MONGODB_URI`.
3. The JWT key and the demo-account password (`SEED_PASSWORD`) are generated by Render — read the password
   under `pulse-api → Environment`.

The free API sleeps after 15 minutes idle; the first request after that takes about a minute.

### Demo accounts (local password `Demo@1234`; on Render, the generated `SEED_PASSWORD`)

| Role      | Email                   |
|-----------|-------------------------|
| Admin     | admin@pulse.local       |
| Organizer | organizer@pulse.local   |
| Attendee  | attendee@pulse.local    |

## Features

- **Roles:** Admin, Organizer, Attendee — JWT auth, bcrypt passwords, role-based route protection on both ends
- **Events:** create / edit / cancel / delete; admin approval queue with rejection reasons; search and category filters
- **Registration:** seat limits enforced with atomic conditional updates (no overselling)
- **Waitlist:** automatic, first-come order; promoted on cancellation or capacity increase
- **QR tickets:** per-registration code, rendered server-side; camera or manual check-in with duplicate / wrong-event detection
- **Emails:** welcome, confirmed, waitlisted, promoted, cancelled, approved/rejected, 24h reminder (logged by default; set `MAIL_ENABLED=true`, `MAIL_USERNAME`, `MAIL_PASSWORD` with a Gmail app password to send)
- **Analytics:** registrations per day, fill and attendance rates, rating distribution, CSV export of attendees
- **Feedback:** 1–5 star ratings with comments, once an event has started
- **Live check-in wall:** full-screen venue display; every scan is pushed over Server-Sent Events and shows up within a second
- **Turnout forecast:** each seat holder's show-up chance from their own attendance history (smoothed toward 85%), predicted no-shows, and a once-per-event button that releases the predicted empty seats to the waitlist
- **Picked for you:** explainable recommendations from an attendee's bookings, ratings, event popularity and how soon events start
- **Verifiable certificates:** checked-in attendees download a PDF certificate; its QR code opens a public `/verify/<id>` page
- **Live seat counts** on every event page (public SSE stream) plus "registrations in the last 24 hours"
- **Add to calendar** (.ics with reminder, Google Calendar) and **share** (native share sheet / copy link)
- **Event poster:** organizers download a 1080×1350 PNG with a QR code to the event
- **Ctrl+K command palette:** search pages, events and actions from the keyboard
- **Validation and errors:** every request body is checked with zod; every error comes back as `{"error": "<plain sentence>"}` (e.g. "Title is required.", "Capacity cannot go below the 2 seats already taken.")

## API overview

| Method | Path | Who |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login` · GET `/api/auth/me` | anyone / signed in |
| GET | `/api/events`, `/api/events/:id`, `/api/events/:id/feedback`, `/api/stats/public`, `/api/health` | anyone |
| GET | `/api/certificates/:code`, `/api/events/:id/stream` (SSE) | anyone |
| POST/DELETE | `/api/attendee/events/:id/register` | attendee |
| GET | `/api/attendee/tickets`, `/api/attendee/tickets/:id/qr`, `/api/attendee/tickets/:id/certificate`, `/api/attendee/recommendations` | attendee |
| POST | `/api/attendee/events/:id/feedback` | attendee |
| GET/POST/PUT/DELETE | `/api/organizer/events[/:id]`, `.../attendees`, `.../analytics` | organizer, admin |
| POST | `/api/organizer/events/:id/cancel`, `/api/organizer/events/:id/release-seats`, `/api/organizer/checkin` | organizer, admin |
| GET | `/api/organizer/overview`, `/api/organizer/events/:id/live` (SSE), `.../live/snapshot` | organizer, admin |
| GET/POST/PATCH | `/api/admin/stats`, `/api/admin/events`, `/api/admin/events/:id/approve` · `reject`, `/api/admin/users[/:id]` | admin |

## Tests

`server/test/api.test.js` runs against a real MongoDB started in memory (mongodb-memory-server):
the whole registration lifecycle (sign-up, approval, seat filling, waitlist promotion, check-in incl.
duplicate scan, QR, feedback rules, analytics, live wall snapshot, turnout forecast, seat release,
recommendations), the 12-way race for 3 seats, event CRUD with ownership checks, certificates,
validation messages and error handling.

```
cd server
npm test
```

## Use of AI tools

As the lab manual asks, AI use is disclosed: an AI coding assistant (Claude, by Anthropic) was used while
building this project — for scaffolding code, porting the backend, writing tests and drafting
documentation. All design decisions, testing and the final review were done by the author.
