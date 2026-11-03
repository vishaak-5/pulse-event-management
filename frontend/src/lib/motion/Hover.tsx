import { animated, to, useSpring } from '@react-spring/web'
import { useRef, type ReactNode } from 'react'
import { springs } from './config'

interface HoverTiltProps {
  children: ReactNode
  className?: string
  /** Max tilt in degrees. */
  tilt?: number
}

const canHover = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches

/**
 * Pointer-following 3D tilt with a soft lift, plus a glow spot that tracks
 * the cursor (exposed as --spot-x / --spot-y for children). Off on touch.
 */
export function HoverTilt({ children, className, tilt = 6 }: HoverTiltProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [s, api] = useSpring(() => ({ rx: 0, ry: 0, lift: 0, x: 50, y: 50, config: springs.gentle }))

  function onMove(e: React.PointerEvent) {
    if (!canHover() || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width
    const py = (e.clientY - r.top) / r.height
    api.start({ rx: (0.5 - py) * tilt, ry: (px - 0.5) * tilt, lift: 1, x: px * 100, y: py * 100 })
  }

  function onLeave() {
    api.start({ rx: 0, ry: 0, lift: 0, x: 50, y: 50 })
  }

  return (
    <animated.div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={className}
      style={{
        transform: to([s.rx, s.ry, s.lift], (rx, ry, lift) =>
          `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(${-lift * 4}px)`),
        ['--spot-x' as string]: s.x.to((x) => `${x}%`),
        ['--spot-y' as string]: s.y.to((y) => `${y}%`),
        ['--spot-o' as string]: s.lift,
      }}
    >
      {children}
    </animated.div>
  )
}
