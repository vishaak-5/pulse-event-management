import bcrypt from 'bcryptjs'
import User from '../models/user.js'
import { issueToken } from '../middleware/auth.js'
import { ApiError, badRequest, conflict, forbidden, notFound } from '../lib/errors.js'
import { sendEmail } from '../lib/email.js'
import { userView } from './views.js'

export const hashPassword = (plain) => bcrypt.hash(plain, 10)

// ---- authentication ----

export async function signUp({ name, email, password, role }) {
  if (role === 'ADMIN') throw forbidden('Admin accounts cannot be created by sign-up.')
  const address = email.toLowerCase()
  if (await User.exists({ email: address })) throw conflict('An account with this email already exists.')
  let user
  try {
    user = await User.create({ name, email: address, passwordHash: await hashPassword(password), role })
  } catch (e) {
    if (e.code === 11000) throw conflict('An account with this email already exists.')
    throw e
  }
  sendEmail(user.email, 'Welcome to Pulse Events', `Welcome, ${user.name}!`,
    `Your ${user.role.toLowerCase()} account is ready. ${user.role === 'ORGANIZER'
      ? 'Create your first event - it goes live once an admin approves it.'
      : 'Browse upcoming events and grab your first ticket.'}`)
  return { token: issueToken(user), user: userView(user) }
}

export async function login({ email, password }) {
  const user = await User.findOne({ email: email.toLowerCase() }).lean()
  // Same message for an unknown email and a wrong password: no account probing.
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new ApiError(401, 'Incorrect email or password.')
  }
  if (!user.enabled) throw forbidden('This account has been disabled. Contact the administrator.')
  return { token: issueToken(user), user: userView(user) }
}

export async function me(userId) {
  const user = await User.findById(userId).lean()
  if (!user) throw notFound('User')
  return userView(user)
}

// ---- administration ----

export async function listUsers() {
  return (await User.find().sort({ createdAt: -1 }).lean()).map(userView)
}

export async function updateUser(id, { enabled, role }, admin) {
  if (enabled === undefined && role === undefined) throw badRequest('Nothing to update.')
  const user = await User.findById(id).lean()
  if (!user) throw notFound('User')
  if (enabled !== undefined && user._id === admin.id) throw badRequest('You cannot disable your own account.')
  if (role !== undefined && user._id === admin.id) throw badRequest('You cannot change your own role.')
  const set = {}
  if (enabled !== undefined) set.enabled = enabled
  if (role !== undefined) set.role = role
  return userView(await User.findByIdAndUpdate(id, { $set: set }, { new: true }).lean())
}
