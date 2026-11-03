import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button, ErrorNote, Eyebrow, Field, Glass, Input } from '../components/ui'
import { homeFor, useAuth } from '../lib/auth'
import { Inview } from '../lib/motion/Inview'
import type { Role } from '../lib/types'

function AuthShell({ eyebrow, title, accent, children, footer }:
  { eyebrow: string; title: string; accent: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="relative mx-auto flex min-h-[100svh] max-w-md items-center px-6 py-28">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/3 size-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,var(--accent-glow),transparent_65%)]" />
      <Inview blur className="relative w-full">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-3 text-4xl font-semibold leading-display tracking-tight">
          {title} <span className="font-serif font-normal italic text-accent">{accent}</span>
        </h1>
        <Glass className="mt-8 p-6">{children}</Glass>
        <p className="mt-6 text-center text-sm text-foreground-subtle">{footer}</p>
      </Inview>
    </div>
  )
}

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const user = await login(email, password)
      navigate(from ?? homeFor(user.role), { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell eyebrow="Welcome back" title="Sign" accent="in."
      footer={<>New here? <Link to="/signup" className="text-accent hover:underline">Create an account</Link></>}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        {error && <ErrorNote message={error} />}
        <Field label="Email">
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" busy={busy} className="mt-2 h-12">Sign in</Button>
      </form>
    </AuthShell>
  )
}

export function Signup() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('ATTENDEE')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const user = await register(name, email, password, role)
      navigate(homeFor(user.role), { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const roleCard = (r: Role, title: string, body: string) => (
    <button type="button" role="radio" aria-checked={role === r} onClick={() => setRole(r)}
      className={`cursor-pointer rounded-card border p-4 text-left transition duration-[var(--duration-fast)] ${
        role === r ? 'border-accent bg-accent-veil' : 'border-border-strong hover:border-foreground-faint'}`}>
      <span className={`block text-sm font-semibold ${role === r ? 'text-accent' : ''}`}>{title}</span>
      <span className="mt-1 block text-xs text-foreground-subtle">{body}</span>
    </button>
  )

  return (
    <AuthShell eyebrow="Get started" title="Create your" accent="account."
      footer={<>Already have one? <Link to="/login" className="text-accent hover:underline">Sign in</Link></>}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        {error && <ErrorNote message={error} />}
        <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Account type">
          {roleCard('ATTENDEE', 'Attendee', 'Find events & get tickets')}
          {roleCard('ORGANIZER', 'Organizer', 'Host & manage events')}
        </div>
        <Field label="Full name">
          <Input autoComplete="name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email">
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" hint="At least 8 characters">
          <Input type="password" autoComplete="new-password" required minLength={8} maxLength={72}
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" busy={busy} className="mt-2 h-12">Create account</Button>
      </form>
    </AuthShell>
  )
}
