import { animated, useSpring } from '@react-spring/web'
import { useEffect, useMemo, useRef, useState, type ElementType, type ReactNode } from 'react'
import { springs } from './config'

interface InviewProps {
  children: ReactNode
  /** Semantic element to render. */
  tag?: ElementType
  className?: string
  /** ms before the reveal starts - use multiples of STAGGER for sequences. */
  delayIn?: number
  /** Vertical offset to rise from, in px. */
  rise?: number
  /** Start blurred, focus in. */
  blur?: boolean
}

/**
 * Reveals its children when they scroll into view (mode "once").
 * Content is always in the DOM - only opacity/transform change.
 */
export function Inview({ children, tag = 'div', className, delayIn = 0, rise = 28, blur = false }: InviewProps) {
  const ref = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true)
        io.disconnect()
      }
    }, { rootMargin: '0px 0px -8% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const style = useSpring({
    from: { opacity: 0, y: rise, blur: blur ? 12 : 0 },
    to: visible ? { opacity: 1, y: 0, blur: 0 } : { opacity: 0, y: rise, blur: blur ? 12 : 0 },
    delay: visible ? delayIn : 0,
    config: springs.entrance,
  })

  const Tag = useMemo(() => animated(tag as 'div'), [tag])
  return (
    <Tag
      ref={ref as React.Ref<HTMLDivElement>}
      className={className}
      style={{
        opacity: style.opacity,
        transform: style.y.to((y) => `translate3d(0, ${y}px, 0)`),
        filter: blur ? style.blur.to((b) => (b > 0.05 ? `blur(${b}px)` : 'none')) : undefined,
      }}
    >
      {children}
    </Tag>
  )
}
