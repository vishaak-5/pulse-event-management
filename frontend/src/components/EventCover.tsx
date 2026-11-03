import type { Category } from '../lib/types'
import { CATEGORY_HUES } from '../lib/format'

/** Deterministic pseudo-random in [0,1) from a seed. */
function rand(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

/**
 * Generative cover art per event: glowing orbs in the category's hues over a
 * dark field with contour rings. Same event id -> same picture, no image files.
 */
export function EventCover({ id, category, className = '' }: { id: number; category: Category; className?: string }) {
  const [h1, h2] = CATEGORY_HUES[category]
  const gid = `cv-${id}`
  const orbs = [0, 1, 2].map((i) => ({
    cx: 15 + rand(id * 3 + i) * 70,
    cy: 15 + rand(id * 7 + i) * 60,
    r: 22 + rand(id * 11 + i) * 26,
    hue: i % 2 ? h2 : h1,
  }))
  const ringX = 30 + rand(id * 13) * 40
  const ringY = 30 + rand(id * 17) * 30

  return (
    <svg viewBox="0 0 100 62" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        {orbs.map((o, i) => (
          <radialGradient key={i} id={`${gid}-o${i}`}>
            <stop offset="0%" stopColor={`hsl(${o.hue} 90% 62%)`} stopOpacity="0.85" />
            <stop offset="60%" stopColor={`hsl(${o.hue} 80% 40%)`} stopOpacity="0.25" />
            <stop offset="100%" stopColor={`hsl(${o.hue} 80% 30%)`} stopOpacity="0" />
          </radialGradient>
        ))}
        <linearGradient id={`${gid}-fade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="40%" stopColor="#05070a" stopOpacity="0" />
          <stop offset="100%" stopColor="#05070a" stopOpacity="0.85" />
        </linearGradient>
      </defs>
      <rect width="100" height="62" fill="#070a0f" />
      {orbs.map((o, i) => <circle key={i} cx={o.cx} cy={o.cy} r={o.r} fill={`url(#${gid}-o${i})`} />)}
      {[8, 14, 20, 26, 32].map((r) => (
        <circle key={r} cx={ringX} cy={ringY} r={r} fill="none" stroke={`hsl(${h1} 90% 70%)`}
          strokeOpacity={0.22 - r * 0.005} strokeWidth="0.25" />
      ))}
      <rect width="100" height="62" fill={`url(#${gid}-fade)`} />
    </svg>
  )
}
