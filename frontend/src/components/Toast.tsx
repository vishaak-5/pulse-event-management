import { animated, to, useTransition } from '@react-spring/web'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { springs } from '../lib/motion/config'

type Tone = 'success' | 'error' | 'info'
interface ToastItem { id: number; tone: Tone; message: string }

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {})

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const push = useCallback((message: string, tone: Tone = 'success') => {
    const id = nextId++
    setItems((xs) => [...xs, { id, tone, message }])
    window.setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4200)
  }, [])

  const transitions = useTransition(items, {
    keys: (t) => t.id,
    from: { opacity: 0, y: 24, scale: 0.96 },
    enter: { opacity: 1, y: 0, scale: 1 },
    leave: { opacity: 0, y: -12, scale: 0.96 },
    config: springs.snappy,
  })

  const tone = { success: 'border-accent/40 text-accent', error: 'border-danger/40 text-danger', info: 'border-info/40 text-info' }

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2" aria-live="polite">
        {transitions((style, t) => (
          <animated.div
            style={{ opacity: style.opacity, transform: to([style.y, style.scale], (y, s) => `translateY(${y}px) scale(${s})`) }}
            className={`pointer-events-auto rounded-card border bg-surface-raised px-4 py-3 text-sm backdrop-blur-glass ${tone[t.tone]}`}
          >
            <span className="text-foreground">{t.message}</span>
          </animated.div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => useContext(ToastContext)
