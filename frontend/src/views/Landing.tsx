import { animated, useSpring, useTrail } from '@react-spring/web'
import { lazy, Suspense, useEffect, useState } from 'react'
import { EventCard } from '../components/EventCard'
import { Eyebrow, Glass, LinkButton } from '../components/ui'
import { api } from '../lib/api'
import { useAuth, homeFor } from '../lib/auth'
import { CountUp } from '../lib/motion/CountUp'
import { Inview } from '../lib/motion/Inview'
import { springs, STAGGER } from '../lib/motion/config'
import type { EventView, PublicStats } from '../lib/types'

const HeroScene = lazy(() => import('../scene/HeroScene'))

const HEADLINE = ['Events', 'that']

function Hero() {
  const { user } = useAuth()
  const trail = useTrail(HEADLINE.length + 1, {
    from: { opacity: 0, y: 40, blur: 14 },
    to: { opacity: 1, y: 0, blur: 0 },
    delay: 150,
    config: springs.entrance,
  })
  const rest = useSpring({ from: { opacity: 0, y: 20 }, to: { opacity: 1, y: 0 }, delay: 650, config: springs.gentle })
  const scene = useSpring({ from: { opacity: 0 }, to: { opacity: 1 }, delay: 100, config: springs.slow })

  const style = (i: number) => ({
    opacity: trail[i].opacity,
    transform: trail[i].y.to((y) => `translate3d(0, ${y}px, 0)`),
    filter: trail[i].blur.to((b) => (b > 0.05 ? `blur(${b}px)` : 'none')),
  })

  return (
    <section className="relative flex min-h-[100svh] items-center overflow-hidden" aria-labelledby="hero-title">
      <animated.div className="absolute inset-0" style={scene}>
        <Suspense fallback={null}><HeroScene /></Suspense>
      </animated.div>
      {/* readability veil on the left, fade to page at the bottom */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,var(--background)_8%,transparent_62%)]" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-[linear-gradient(transparent,var(--background))]" />

      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-6 pb-16 pt-32 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <animated.div style={{ opacity: rest.opacity }}>
            <span className="inline-flex items-center gap-2 rounded-pill border border-border-strong bg-surface px-3 py-1 text-xs text-foreground-muted backdrop-blur-glass">
              <span className="rounded-pill bg-accent px-1.5 py-px text-xs font-bold uppercase text-accent-contrast">New</span>
              QR check-in + smart waitlists
            </span>
          </animated.div>
          <h1 id="hero-title" className="mt-6 text-[clamp(3rem,7.5vw,6.2rem)] font-semibold leading-[1.02] tracking-[-0.035em]">
            {HEADLINE.map((w, i) => (
              <animated.span key={w} style={style(i)} className="mr-[0.22em] inline-block">{w}</animated.span>
            ))}
            <br />
            <animated.span style={style(HEADLINE.length)}
              className="inline-block pb-2 font-serif font-normal italic tracking-[-0.01em] text-accent [text-shadow:0_0_40px_var(--accent-glow)]">
              run themselves.
            </animated.span>
          </h1>
          <animated.div style={{ opacity: rest.opacity, transform: rest.y.to((y) => `translateY(${y}px)`) }}>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-foreground-muted">
              Publish an event, and Pulse handles the rest - registrations, seat limits, an auto-promoting
              waitlist, QR tickets, door check-in and live analytics.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <LinkButton to="/events" className="h-12 px-6">
                Explore events
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </LinkButton>
              <LinkButton to={user ? homeFor(user.role) : '/signup'} variant="ghost" className="h-12 px-6">
                {user ? 'Open dashboard' : 'Host an event'}
              </LinkButton>
            </div>
          </animated.div>
        </div>
        <animated.div style={{ opacity: rest.opacity }} className="hidden lg:block">
          <FlowPanel />
        </animated.div>
      </div>
    </section>
  )
}

/** The floating "automation" panel - a live-looking pipeline of what happens after sign-up. */
function FlowPanel() {
  const steps = [
    { title: 'Registration', detail: 'Seat 118 of 120 confirmed', tone: 'bg-accent' },
    { title: 'Capacity reached', detail: 'Waitlist opened automatically', tone: 'bg-warning' },
    { title: 'Seat released', detail: 'Kavya promoted from waitlist', tone: 'bg-accent' },
    { title: 'Door check-in', detail: 'QR scanned · 09:02', tone: 'bg-info' },
  ]
  const [active, setActive] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setActive((a) => (a + 1) % steps.length), 1800)
    return () => window.clearInterval(id)
  }, [steps.length])

  return (
    <Glass className="ml-auto max-w-sm p-5 shadow-[0_40px_120px_-30px_var(--accent-glow)]">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">Build Night · live</p>
        <span className="flex items-center gap-1.5 text-xs text-accent">
          <span className="size-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" /> Running
        </span>
      </div>
      <ol className="mt-5 flex flex-col gap-0">
        {steps.map((s, i) => (
          <FlowStep key={s.title} {...s} active={i === active} done={i < active} last={i === steps.length - 1} />
        ))}
      </ol>
    </Glass>
  )
}

function FlowStep({ title, detail, tone, active, done, last }:
  { title: string; detail: string; tone: string; active: boolean; done: boolean; last: boolean }) {
  const s = useSpring({ glow: active ? 1 : 0, dim: active || done ? 1 : 0.45, config: springs.gentle })
  return (
    <animated.li className="relative flex gap-4 pb-5" style={{ opacity: s.dim }}>
      {!last && <span aria-hidden className="absolute left-[11px] top-7 h-[calc(100%-20px)] w-px bg-border-strong" />}
      <span className="relative mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-border-strong bg-background-deep">
        <animated.span className={`size-2 rounded-full ${tone}`}
          style={{ boxShadow: s.glow.to((g) => `0 0 ${g * 14}px ${g * 3}px var(--accent-glow)`), transform: s.glow.to((g) => `scale(${1 + g * 0.4})`) }} />
      </span>
      <animated.div className="flex-1 rounded-card border px-3.5 py-2.5"
        style={{
          borderColor: s.glow.to((g) => `rgb(94 242 176 / ${0.05 + g * 0.3})`),
          backgroundColor: s.glow.to((g) => `rgb(94 242 176 / ${g * 0.06})`),
        }}>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-foreground-subtle">{detail}</p>
      </animated.div>
    </animated.li>
  )
}

function StatsStrip() {
  const [stats, setStats] = useState<PublicStats | null>(null)
  useEffect(() => { api.publicStats().then(setStats).catch(() => setStats(null)) }, [])
  const items = [
    { label: 'Upcoming events', value: stats?.upcomingEvents ?? 0 },
    { label: 'Tickets issued', value: stats?.ticketsIssued ?? 0 },
    { label: 'Attendees', value: stats?.attendees ?? 0 },
    { label: 'Organizers', value: stats?.organizers ?? 0 },
  ]
  return (
    <section aria-label="Platform numbers" className="mx-auto max-w-6xl px-6">
      <Glass className="grid grid-cols-2 divide-border md:grid-cols-4 md:divide-x">
        {items.map((it, i) => (
          <Inview key={it.label} delayIn={i * STAGGER} className="px-6 py-7">
            <p className="text-4xl font-semibold tracking-tight"><CountUp value={it.value} /></p>
            <p className="mt-1 text-sm text-foreground-subtle">{it.label}</p>
          </Inview>
        ))}
      </Glass>
    </section>
  )
}

function Upcoming() {
  const [events, setEvents] = useState<EventView[] | null>(null)
  useEffect(() => { api.events().then((e) => setEvents(e.slice(0, 3))).catch(() => setEvents([])) }, [])
  if (events && events.length === 0) return null
  return (
    <section className="mx-auto mt-20 max-w-6xl px-4 sm:mt-28 sm:px-6" aria-labelledby="upcoming-title">
      <div className="flex items-end justify-between gap-6">
        <Inview>
          <Eyebrow>Happening soon</Eyebrow>
          <h2 id="upcoming-title" className="mt-3 text-4xl font-semibold leading-display tracking-tight md:text-5xl">
            Grab a seat <span className="font-serif font-normal italic text-accent">before they're gone.</span>
          </h2>
        </Inview>
        <LinkButton to="/events" variant="ghost" className="hidden md:inline-flex">All events</LinkButton>
      </div>
      <ul className="mt-10 grid gap-6 md:grid-cols-3">
        {(events ?? []).map((e, i) => (
          <Inview key={e.id} tag="li" delayIn={i * STAGGER} className="h-full"><EventCard event={e} /></Inview>
        ))}
      </ul>
    </section>
  )
}

const FLOW = [
  { n: '01', title: 'Publish', body: 'Organizers create an event with a seat limit. Admins approve it before it goes public.' },
  { n: '02', title: 'Register', body: 'Attendees sign up in one tap. When seats run out, they join the waitlist instead.' },
  { n: '03', title: 'Auto-promote', body: 'Someone cancels? The next person on the waitlist is confirmed and emailed instantly.' },
  { n: '04', title: 'Check in', body: 'Every seat gets a QR ticket. Scan it at the door with any phone camera.' },
]

function HowItFlows() {
  return (
    <section className="mx-auto mt-20 max-w-6xl px-4 sm:mt-28 sm:px-6" aria-labelledby="flow-title">
      <Inview className="max-w-2xl">
        <Eyebrow>How it flows</Eyebrow>
        <h2 id="flow-title" className="mt-3 text-4xl font-semibold leading-display tracking-tight md:text-5xl">
          From announcement to <span className="font-serif font-normal italic text-accent">front door.</span>
        </h2>
      </Inview>
      <ol className="relative mt-12 grid gap-4 md:grid-cols-4">
        <span aria-hidden className="absolute left-0 right-0 top-[38px] hidden h-px bg-[linear-gradient(90deg,transparent,var(--accent),transparent)] opacity-40 md:block" />
        {FLOW.map((f, i) => (
          <Inview key={f.n} tag="li" delayIn={i * STAGGER * 1.5}>
            <Glass className="h-full p-6">
              <span className="relative grid size-9 place-items-center rounded-full border border-accent/40 bg-background-deep font-mono text-xs text-accent shadow-[0_0_24px_var(--accent-glow)]">
                {f.n}
              </span>
              <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-foreground-muted">{f.body}</p>
            </Glass>
          </Inview>
        ))}
      </ol>
    </section>
  )
}

const ROLES = [
  { role: 'Attendees', points: ['Browse & search events', 'One-tap registration', 'QR tickets in your pocket', 'Rate events afterwards'] },
  { role: 'Organizers', points: ['Create and edit events', 'Live attendee lists', 'Camera QR check-in', 'Registration & attendance analytics'] },
  { role: 'Admins', points: ['Approve or reject events', 'Manage users and roles', 'Platform-wide statistics', 'Keep the calendar clean'] },
]

function Roles() {
  return (
    <section className="mx-auto mt-20 max-w-6xl px-4 sm:mt-28 sm:px-6" aria-labelledby="roles-title">
      <Inview className="text-center">
        <Eyebrow className="justify-center">Built for everyone in the room</Eyebrow>
        <h2 id="roles-title" className="mt-3 text-4xl font-semibold leading-display tracking-tight md:text-5xl">
          Three roles. <span className="font-serif font-normal italic text-accent">One system.</span>
        </h2>
      </Inview>
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {ROLES.map((r, i) => (
          <Inview key={r.role} delayIn={i * STAGGER}>
            <Glass tag="article" className="h-full p-7">
              <h3 className="text-xl font-semibold">{r.role}</h3>
              <ul className="mt-5 flex flex-col gap-3">
                {r.points.map((p) => (
                  <li key={p} className="flex items-start gap-3 text-sm text-foreground-muted">
                    <svg className="mt-0.5 shrink-0 text-accent" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden>
                      <path d="m5 12 5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {p}
                  </li>
                ))}
              </ul>
            </Glass>
          </Inview>
        ))}
      </div>
    </section>
  )
}

function Cta() {
  const { user } = useAuth()
  return (
    <section className="mx-auto mt-20 max-w-6xl px-4 sm:mt-28 sm:px-6">
      <Inview blur>
        <Glass className="overflow-hidden px-8 py-16 text-center md:px-16">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_120%,var(--accent-glow),transparent)]" />
          <h2 className="relative text-4xl font-semibold leading-display tracking-tight md:text-6xl">
            Your next event, <span className="font-serif font-normal italic text-accent">handled.</span>
          </h2>
          <p className="relative mx-auto mt-5 max-w-lg text-foreground-muted">
            Free to use. Create an account as an attendee or an organizer and be live in minutes.
          </p>
          <div className="relative mt-8 flex justify-center gap-3">
            <LinkButton to={user ? homeFor(user.role) : '/signup'} className="h-12 px-7">
              {user ? 'Go to dashboard' : 'Create free account'}
            </LinkButton>
          </div>
        </Glass>
      </Inview>
    </section>
  )
}

export function Landing() {
  return (
    <>
      <Hero />
      <StatsStrip />
      <Upcoming />
      <HowItFlows />
      <Roles />
      <Cta />
    </>
  )
}
