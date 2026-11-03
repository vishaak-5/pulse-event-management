import { Globals } from '@react-spring/web'
import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout, Page } from './components/Layout'
import { RequireRole } from './components/RequireRole'
import { ToastProvider } from './components/Toast'
import { Empty, LinkButton, Loading } from './components/ui'
import { AuthProvider } from './lib/auth'
import { Login, Signup } from './views/Auth'
import { EventDetail } from './views/EventDetail'
import { Events } from './views/Events'
import { Landing } from './views/Landing'
import { Tickets } from './views/Tickets'
import { Verify } from './views/Verify'

// Role dashboards pull in charts and the QR scanner - load them on demand.
const AdminDashboard = lazy(() => import('./views/AdminDashboard').then((m) => ({ default: m.AdminDashboard })))
const CheckIn = lazy(() => import('./views/CheckIn').then((m) => ({ default: m.CheckIn })))
const EventForm = lazy(() => import('./views/EventForm').then((m) => ({ default: m.EventForm })))
const EventManage = lazy(() => import('./views/EventManage').then((m) => ({ default: m.EventManage })))
const OrganizerDashboard = lazy(() => import('./views/OrganizerDashboard').then((m) => ({ default: m.OrganizerDashboard })))
const LiveWall = lazy(() => import('./views/LiveWall').then((m) => ({ default: m.LiveWall })))

const Lazy = ({ children }: { children: ReactNode }) => <Suspense fallback={<Page><Loading shape="dashboard" /></Page>}>{children}</Suspense>

// Reduced-motion users get every spring at its end state immediately.
if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  Globals.assign({ skipAnimation: true })
}

function NotFound() {
  return (
    <Page>
      <Empty title="Page not found">
        That link doesn't lead anywhere.
        <div className="mt-5"><LinkButton to="/">Back home</LinkButton></div>
      </Empty>
    </Page>
  )
}

const organizer = ['ORGANIZER', 'ADMIN'] as const

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            {/* Full-screen venue display: no site chrome. */}
            <Route path="organizer/events/:id/wall"
              element={<RequireRole roles={[...organizer]}><Suspense fallback={<Loading shape="wall" />}><LiveWall /></Suspense></RequireRole>} />
            <Route element={<Layout />}>
              <Route index element={<Landing />} />
              <Route path="events" element={<Events />} />
              <Route path="events/:id" element={<EventDetail />} />
              <Route path="login" element={<Login />} />
              <Route path="signup" element={<Signup />} />
              <Route path="verify/:code" element={<Verify />} />
              <Route path="tickets" element={<RequireRole roles={['ATTENDEE']}><Tickets /></RequireRole>} />
              <Route path="organizer" element={<RequireRole roles={[...organizer]}><Lazy><OrganizerDashboard /></Lazy></RequireRole>} />
              <Route path="organizer/events/new" element={<RequireRole roles={[...organizer]}><Lazy><EventForm /></Lazy></RequireRole>} />
              <Route path="organizer/events/:id" element={<RequireRole roles={[...organizer]}><Lazy><EventManage /></Lazy></RequireRole>} />
              <Route path="organizer/events/:id/edit" element={<RequireRole roles={[...organizer]}><Lazy><EventForm key="edit" /></Lazy></RequireRole>} />
              <Route path="organizer/checkin" element={<RequireRole roles={[...organizer]}><Lazy><CheckIn /></Lazy></RequireRole>} />
              <Route path="admin" element={<RequireRole roles={['ADMIN']}><Lazy><AdminDashboard /></Lazy></RequireRole>} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
