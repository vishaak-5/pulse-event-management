import { Router } from 'express'
import { requireRole } from '../middleware/auth.js'
import { loginSchema, registerSchema } from '../lib/validation.js'
import { login, me, signUp } from '../services/users.js'

const router = Router()

router.post('/register', async (req, res) => {
  res.status(201).json(await signUp(registerSchema.parse(req.body ?? {})))
})

router.post('/login', async (req, res) => {
  res.json(await login(loginSchema.parse(req.body ?? {})))
})

router.get('/me', requireRole(), async (req, res) => {
  res.json(await me(req.user.id))
})

export default router
