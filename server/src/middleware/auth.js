import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import { ApiError } from '../lib/errors.js'
import User from '../models/user.js'

export function issueToken(user) {
  return jwt.sign({ role: user.role }, config.jwtSecret, {
    subject: String(user._id), expiresIn: config.jwtExpiry, algorithm: 'HS512',
  })
}

/**
 * Reads "Authorization: Bearer <token>". On a valid token for an enabled user,
 * sets req.user = {id, email, name, role}. The user is re-read on every request
 * so disabling an account or changing a role takes effect immediately.
 * Never rejects by itself - requireRole() does that.
 */
export async function authenticate(req, res, next) {
  const header = req.get('authorization') || ''
  if (header.startsWith('Bearer ')) {
    try {
      const { sub } = jwt.verify(header.slice(7), config.jwtSecret, { algorithms: ['HS512'] })
      const user = await User.findById(Number(sub)).lean()
      if (user?.enabled) req.user = { id: user._id, email: user.email, name: user.name, role: user.role }
    } catch {
      /* invalid or expired token: treated as signed out */
    }
  }
  next()
}

/** Route guard: 401 when signed out, 403 when the role is not allowed. */
export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(new ApiError(401, 'Please sign in to continue.'))
  if (roles.length && !roles.includes(req.user.role)) return next(new ApiError(403, 'You do not have access to this.'))
  next()
}

export const isAdmin = (user) => user?.role === 'ADMIN'
