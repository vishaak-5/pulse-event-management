import { animated, useSpring } from '@react-spring/web'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { homeFor, useAuth } from '../lib/auth'
import { springs } from '../lib/motion/config'
import type { Role } from '../lib/types'
import { CommandPalette, PALETTE_EVENT } from './CommandPalette'
import { LinkButton } from './ui'

const LINKS: Record<Role | 'GUEST', { to: string; label: string }[]> = {
  GUEST: [{ to: '/events', label: 'Events' }],
  ATTENDEE: [{ to: '/events', label: 'Events' }, { to: '/tickets', label: 'My tickets' }],
  ORGANIZER: [
    { to: '/events', label: 'Events' },
    { to: '/organizer', label: 'Dashboard' },
    { to: '/organizer/checkin', label: 'Check-in' },
  ],
  ADMIN: [{ to: '/events', label: 'Events' }, { to: '/admin', label: 'Admin' }, { to: '/organizer', label: 'Events I run' }],
}

export function Logo() {
  return (
    <Link to="/" className="tap-target flex items-center gap-2.5 text-foreground" aria-label="Pulse home">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="9" className="fill-surface-solid" />
        <path d="M5 17h5l3-8 5 15 3-7h6" fill="none" stroke="var(--accent)" strokeWidth="2.6"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-lg font-semibold tracking-tight">pulse</span>
    </Link>
  )
}

function Nav() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => { setOpen(false) }, [location.pathname])

  const bar = useSpring({ bg: scrolled || open ? 1 : 0, config: springs.gentle })
  const links = LINKS[user?.role ?? 'GUEST']

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `tap-target inline-flex items-center rounded-pill px-3.5 py-1.5 text-sm transition duration-[var(--duration-fast)] ${
      isActive ? 'bg-accent-veil text-accent' : 'text-foreground-muted hover:text-foreground'}`

  return (
    <header className="fixed inset-x-0 top-0 z-40 px-4 pt-3">
      <animated.nav
        aria-label="Main"
        className="mx-auto flex max-w-6xl items-center justify-between gap-4 rounded-pill border px-4 py-2.5 backdrop-blur-glass"
        style={{
          backgroundColor: bar.bg.to((b) => `rgb(10 14 20 / ${0.15 + b * 0.6})`),
          borderColor: bar.bg.to((b) => `rgb(255 255 255 / ${0.04 + b * 0.06})`),
        }}
      >
        <Logo />
        <div className="hidden items-center gap-1 md:flex">
          {links.map((l) => <NavLink key={l.to} to={l.to} end className={linkClass}>{l.label}</NavLink>)}
        </div>
        <div className="hidden items-center gap-3 md:flex">
          <button type="button" onClick={() => window.dispatchEvent(new Event(PALETTE_EVENT))}
            className="flex cursor-pointer items-center gap-2 rounded-pill border border-border-strong px-3 py-1.5 text-xs text-foreground-subtle transition duration-[var(--duration-fast)] hover:border-accent hover:text-accent"
            aria-label="Open command palette">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" strokeLinecap="round" />
            </svg>
            <kbd className="font-mono">Ctrl K</kbd>
          </button>
          {user ? (
            <>
              <Link to={homeFor(user.role)} className="text-right leading-tight">
                <span className="block text-sm font-medium">{user.name}</span>
                <span className="block text-xs uppercase tracking-wider text-foreground-subtle">{user.role.toLowerCase()}</span>
              </Link>
              <button type="button" onClick={() => { logout(); navigate('/') }}
                className="cursor-pointer rounded-pill border border-border-strong px-3.5 py-1.5 text-sm text-foreground-muted transition duration-[var(--duration-fast)] hover:border-danger hover:text-danger">
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-sm text-foreground-muted transition duration-[var(--duration-fast)] hover:text-foreground">Sign in</Link>
              <LinkButton to="/signup" className="h-9 px-4">Get started</LinkButton>
            </>
          )}
        </div>
        <button type="button" className="cursor-pointer p-2 md:hidden" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 8h16M4 16h16" />}
          </svg>
        </button>
      </animated.nav>
      {open && (
        <div className="mx-auto mt-2 flex max-w-6xl flex-col gap-1 rounded-panel border border-border bg-surface-raised p-3 backdrop-blur-glass md:hidden">
          {links.map((l) => <NavLink key={l.to} to={l.to} end className={linkClass}>{l.label}</NavLink>)}
          <div className="mt-2 border-t border-border pt-3">
            {user ? (
              <button type="button" onClick={() => { logout(); navigate('/') }} className="cursor-pointer px-3.5 text-sm text-danger">
                Sign out ({user.name})
              </button>
            ) : (
              <div className="flex gap-3 px-1">
                <LinkButton to="/login" variant="ghost" className="h-9 flex-1">Sign in</LinkButton>
                <LinkButton to="/signup" className="h-9 flex-1">Get started</LinkButton>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  )
}

function Footer() {
  return (
    <footer className="relative z-10 mt-24 border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 md:flex-row md:items-center md:justify-between">
        <div>
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-foreground-subtle">
            Smart Event Management and Registration System - a Full Stack Development project.
          </p>
        </div>
        <p className="font-mono text-xs text-foreground-faint">Spring Boot · React · MySQL · Three.js</p>
      </div>
    </footer>
  )
}

export function Layout() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return (
    <div className="app-backdrop relative min-h-screen overflow-x-clip">
      <Nav />
      <CommandPalette />
      <main className="relative z-10">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

/** Standard page container for inner pages (clears the floating nav). */
export function Page({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto max-w-6xl px-4 pt-24 sm:px-6 sm:pt-28 ${className}`}>{children}</div>
}
