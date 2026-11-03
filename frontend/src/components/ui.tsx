import { animated, useSpring } from '@react-spring/web'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import type { EventStatus, RegistrationStatus } from '../lib/types'
import { titleCase } from '../lib/format'

/* ---------- Buttons ---------- */

type Variant = 'primary' | 'ghost' | 'danger' | 'subtle'

const variantClass: Record<Variant, string> = {
  primary:
    'bg-accent text-accent-contrast hover:bg-accent-soft shadow-[0_0_0_1px_var(--accent),0_8px_30px_-6px_var(--accent-glow)]',
  ghost: 'bg-surface text-foreground border border-border-strong hover:border-accent hover:text-accent backdrop-blur-glass',
  danger: 'bg-transparent text-danger border border-danger/40 hover:bg-danger/10',
  subtle: 'bg-transparent text-foreground-muted hover:text-foreground',
}

const base =
  'press inline-flex items-center justify-center gap-2 rounded-pill px-5 h-11 text-sm font-semibold whitespace-nowrap ' +
  'transition duration-[var(--duration-fast)] disabled:opacity-50 disabled:pointer-events-none cursor-pointer'

export function Button({ variant = 'primary', className = '', busy, children, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button {...rest} disabled={rest.disabled || busy} className={`${base} ${variantClass[variant]} ${className}`}>
      {busy && <Spinner size={14} />}
      {children}
    </button>
  )
}

export function LinkButton({ variant = 'primary', className = '', ...rest }: LinkProps & { variant?: Variant }) {
  return <Link {...rest} className={`${base} ${variantClass[variant]} ${className}`} />
}

/* ---------- Surfaces & labels ---------- */

export function Glass({ children, className = '', tag: Tag = 'div' }:
  { children: ReactNode; className?: string; tag?: 'div' | 'section' | 'article' | 'aside' | 'form' }) {
  return (
    <Tag className={`relative rounded-panel border border-border bg-surface backdrop-blur-glass ${className}`}>
      {children}
    </Tag>
  )
}

export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-eyebrow text-accent ${className}`}>
      <span className="size-1.5 rounded-full bg-accent shadow-[0_0_10px_var(--accent)]" aria-hidden />
      {children}
    </p>
  )
}

export function PageHeader({ eyebrow, title, accent, children }:
  { eyebrow: string; title: string; accent?: string; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-3 text-4xl font-semibold leading-display tracking-tight md:text-5xl">
          {title} {accent && <span className="font-serif font-normal italic text-accent">{accent}</span>}
        </h1>
      </div>
      {children && <div className="flex flex-wrap gap-3">{children}</div>}
    </header>
  )
}

/* ---------- Status badges ---------- */

const statusTone: Record<EventStatus | RegistrationStatus, string> = {
  APPROVED: 'text-accent border-accent/30 bg-accent-veil',
  CONFIRMED: 'text-accent border-accent/30 bg-accent-veil',
  CHECKED_IN: 'text-info border-info/30 bg-info/10',
  PENDING: 'text-warning border-warning/30 bg-warning/10',
  WAITLISTED: 'text-warning border-warning/30 bg-warning/10',
  REJECTED: 'text-danger border-danger/30 bg-danger/10',
  CANCELLED: 'text-foreground-subtle border-border-strong bg-surface',
}

export function StatusBadge({ status }: { status: EventStatus | RegistrationStatus }) {
  return (
    <span className={`inline-flex items-center rounded-pill border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${statusTone[status]}`}>
      {titleCase(status)}
    </span>
  )
}

/* ---------- Form fields ---------- */

const fieldBase =
  'w-full rounded-control border border-border-strong bg-background-deep/60 px-4 py-3 text-sm text-foreground ' +
  'placeholder:text-foreground-faint outline-none transition duration-[var(--duration-fast)] ' +
  'focus:border-accent focus:bg-background-deep'

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-xs font-medium uppercase tracking-wider text-foreground-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-foreground-subtle">{hint}</span>}
    </label>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${fieldBase} ${props.className ?? ''}`} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${fieldBase} min-h-32 resize-y ${props.className ?? ''}`} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${fieldBase} ${props.className ?? ''}`} />
}

/* ---------- Feedback states ---------- */

export function Spinner({ size = 20 }: { size?: number }) {
  const s = useSpring({ from: { r: 0 }, to: { r: 360 }, loop: true, config: { duration: 900 } })
  return (
    <animated.svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden
      style={{ transform: s.r.to((r) => `rotate(${r}deg)`) }}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </animated.svg>
  )
}

type SkeletonShape = 'page' | 'cards' | 'detail' | 'dashboard' | 'table' | 'wall'

/** A grey block that gently pulses; used to sketch the layout that is loading. */
function Bone({ className = '' }: { className?: string }) {
  const s = useSpring({ from: { o: 0.45 }, to: { o: 0.85 }, loop: { reverse: true }, config: { tension: 60, friction: 20 } })
  return <animated.div aria-hidden style={{ opacity: s.o }} className={`rounded-card bg-surface-hover ${className}`} />
}

const cardBones = (n: number) => Array.from({ length: n }, (_, i) => (
  <div key={i} className="overflow-hidden rounded-panel border border-border">
    <Bone className="aspect-[100/52] rounded-none" />
    <div className="flex flex-col gap-3 p-5">
      <Bone className="h-5 w-3/4" />
      <Bone className="h-4 w-1/2" />
      <Bone className="mt-2 h-1.5 w-full" />
    </div>
  </div>
))

/**
 * Loading state shaped like the content it stands in for (skeleton screen),
 * so the layout does not jump when data arrives. Screen readers hear the label.
 */
export function Loading({ label = 'Loading', shape = 'page' }: { label?: string; shape?: SkeletonShape }) {
  return (
    <div role="status" aria-live="polite" className={shape === 'wall' ? 'grid h-[100svh] place-items-center' : 'py-2'}>
      <span className="sr-only">{label}…</span>
      {shape === 'cards' && <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{cardBones(3)}</div>}
      {shape === 'detail' && (
        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          <div className="flex flex-col gap-4"><Bone className="aspect-[100/42] w-full" /><Bone className="h-4 w-1/3" /><Bone className="h-4 w-full" /><Bone className="h-4 w-5/6" /></div>
          <Bone className="h-80" />
        </div>
      )}
      {shape === 'dashboard' && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Bone key={i} className="h-28" />)}</div>
          <Bone className="h-64" />
        </div>
      )}
      {shape === 'table' && (
        <div className="flex flex-col gap-2">{[0, 1, 2, 3, 4].map((i) => <Bone key={i} className="h-12" />)}</div>
      )}
      {shape === 'page' && (
        <div className="flex flex-col gap-4"><Bone className="h-10 w-2/5" /><Bone className="h-4 w-3/5" /><Bone className="mt-4 h-56" /></div>
      )}
      {shape === 'wall' && <Bone className="size-[min(38vw,46vh)] rounded-full" />}
    </div>
  )
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-control border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
      {message}
    </p>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Glass className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="grid size-12 place-items-center rounded-full border border-border-strong text-accent" aria-hidden>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 12h4l3-8 4 16 3-8h4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      {children && <div className="max-w-md text-sm text-foreground-muted">{children}</div>}
    </Glass>
  )
}

/* ---------- Stats ---------- */

export function StatTile({ label, value, sub, tone = 'accent' }:
  { label: string; value: ReactNode; sub?: string; tone?: 'accent' | 'warning' | 'info' | 'special' }) {
  const dot = { accent: 'bg-accent', warning: 'bg-warning', info: 'bg-info', special: 'bg-special' }[tone]
  return (
    <Glass className="overflow-hidden p-5">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-foreground-muted">
        <span className={`size-1.5 rounded-full ${dot}`} aria-hidden />{label}
      </p>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-foreground-subtle">{sub}</p>}
    </Glass>
  )
}

export function SeatMeter({ taken, capacity }: { taken: number; capacity: number }) {
  const pct = capacity === 0 ? 0 : Math.min(1, taken / capacity)
  const s = useSpring({ from: { w: 0 }, to: { w: pct } })
  const full = pct >= 1
  return (
    <div>
      <div className="h-1.5 overflow-hidden rounded-pill bg-border-strong">
        <animated.div
          className={`h-full origin-left rounded-pill ${full ? 'bg-warning' : 'bg-accent shadow-[0_0_12px_var(--accent)]'}`}
          style={{ transform: s.w.to((w) => `scaleX(${w})`) }}
        />
      </div>
      <p className="mt-2 flex justify-between text-xs text-foreground-subtle">
        <span>{taken} / {capacity} seats</span>
        <span className={full ? 'text-warning' : 'text-accent'}>{full ? 'Full - waitlist open' : `${capacity - taken} left`}</span>
      </p>
    </div>
  )
}

export function Stars({ value, size = 16, onChange }: { value: number; size?: number; onChange?: (v: number) => void }) {
  return (
    <div className="inline-flex gap-1" role={onChange ? 'radiogroup' : 'img'} aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= Math.round(value)
        const star = (
          <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden
            className={on ? 'fill-accent text-accent' : 'fill-transparent text-foreground-faint'}>
            <path stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
              d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
          </svg>
        )
        return onChange ? (
          <button key={n} type="button" role="radio" aria-checked={n === value} aria-label={`${n} star${n > 1 ? 's' : ''}`}
            onClick={() => onChange(n)} className="cursor-pointer">{star}</button>
        ) : <span key={n}>{star}</span>
      })}
    </div>
  )
}
