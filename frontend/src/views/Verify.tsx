import { animated, useSpring } from '@react-spring/web'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Page } from '../components/Layout'
import { Eyebrow, Glass, LinkButton, Loading } from '../components/ui'
import { api, ApiError } from '../lib/api'
import { formatFull, formatTime, titleCase } from '../lib/format'
import { springs } from '../lib/motion/config'
import type { CertificateView } from '../lib/types'

/** Public page behind the QR code on every certificate. */
export function Verify() {
  const { code = '' } = useParams()
  const [cert, setCert] = useState<CertificateView | null>(null)
  const [state, setState] = useState<'loading' | 'valid' | 'invalid' | 'error'>('loading')

  useEffect(() => {
    api.verifyCertificate(code)
      .then((c) => { setCert(c); setState('valid') })
      .catch((e) => setState(e instanceof ApiError && e.status === 404 ? 'invalid' : 'error'))
  }, [code])

  const pop = useSpring({ from: { s: 0.6, o: 0 }, to: { s: state === 'loading' ? 0.6 : 1, o: state === 'loading' ? 0 : 1 },
    config: springs.snappy })

  if (state === 'loading') return <Page><Loading label="Checking certificate" /></Page>

  const ok = state === 'valid' && cert
  return (
    <Page className="max-w-2xl">
      <Glass className={`overflow-hidden p-8 text-center md:p-12 ${ok ? 'border-accent/40' : 'border-danger/40'}`}>
        <div aria-hidden className={`pointer-events-none absolute inset-0 ${ok
          ? 'bg-[radial-gradient(60%_50%_at_50%_0%,var(--accent-glow),transparent)]' : ''}`} />
        <animated.div style={{ opacity: pop.o, transform: pop.s.to((s) => `scale(${s})`) }}
          className={`relative mx-auto grid size-20 place-items-center rounded-full border-2 ${ok
            ? 'border-accent text-accent shadow-[0_0_40px_var(--accent-glow)]' : 'border-danger text-danger'}`}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden>
            {ok ? <path d="m5 12 5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
              : <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />}
          </svg>
        </animated.div>
        {ok ? (
          <div className="relative">
            <Eyebrow className="mt-8 justify-center">Verified certificate</Eyebrow>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
              <span className="font-serif font-normal italic text-accent">{cert.attendeeName}</span>
            </h1>
            <p className="mt-3 text-foreground-muted">attended and was checked in at</p>
            <p className="mt-2 text-xl font-semibold">{cert.eventTitle}</p>
            <dl className="mx-auto mt-8 grid max-w-md gap-3 text-left text-sm">
              {[
                ['Date', formatFull(cert.startAt)],
                ['Venue', cert.venue],
                ['Category', titleCase(cert.category)],
                ['Organizer', cert.organizerName],
                ['Checked in', formatTime(cert.checkedInAt)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-6 border-b border-border pb-2">
                  <dt className="text-foreground-subtle">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-6 break-all font-mono text-xs text-foreground-faint">ID {cert.code}</p>
          </div>
        ) : (
          <div className="relative">
            <h1 className="mt-8 text-2xl font-semibold">
              {state === 'invalid' ? 'This certificate could not be verified' : 'Verification is unavailable right now'}
            </h1>
            <p className="mt-3 text-foreground-muted">
              {state === 'invalid'
                ? 'No certificate with this ID was issued by Pulse. It may have been altered or typed incorrectly.'
                : 'Please try again in a moment.'}
            </p>
          </div>
        )}
        <div className="relative mt-10"><LinkButton to="/events" variant="ghost">Browse events</LinkButton></div>
      </Glass>
    </Page>
  )
}
