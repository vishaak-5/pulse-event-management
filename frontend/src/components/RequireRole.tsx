import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { homeFor, useAuth } from '../lib/auth'
import type { Role } from '../lib/types'
import { Loading } from './ui'

/** Gate for role-specific pages: signed-out users go to login, wrong roles go home. */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="mx-auto max-w-6xl px-4 pt-24 sm:px-6 sm:pt-28"><Loading /></div>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />
  return <>{children}</>
}
