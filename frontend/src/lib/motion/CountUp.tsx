import { animated, useSpring } from '@react-spring/web'
import { useEffect, useRef, useState } from 'react'
import { springs } from './config'

/** Number that springs from 0 to its value the first time it is seen. */
export function CountUp({ value, decimals = 0, suffix = '' }: { value: number; decimals?: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [seen, setSeen] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setSeen(true)
        io.disconnect()
      }
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const { n } = useSpring({ n: seen ? value : 0, config: springs.slow })
  return (
    <animated.span ref={ref} className="tabular-nums">
      {n.to((v) => v.toFixed(decimals) + suffix)}
    </animated.span>
  )
}
