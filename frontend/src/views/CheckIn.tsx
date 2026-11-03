import { animated, useSpring } from '@react-spring/web'
import { Html5Qrcode } from 'html5-qrcode'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Page } from '../components/Layout'
import { Button, Field, Glass, Input, LinkButton, PageHeader, Select } from '../components/ui'
import { api, ApiError } from '../lib/api'
import { formatDate, formatTime } from '../lib/format'
import { springs } from '../lib/motion/config'
import type { CheckInResult, EventView } from '../lib/types'

type Outcome = { ok: true; result: CheckInResult } | { ok: false; message: string }

export function CheckIn() {
  const [params] = useSearchParams()
  const [events, setEvents] = useState<EventView[]>([])
  const [eventId, setEventId] = useState<string>(params.get('event') ?? '')
  const [scanning, setScanning] = useState(false)
  const [manual, setManual] = useState('')
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [log, setLog] = useState<CheckInResult[]>([])
  const [camError, setCamError] = useState('')
  const scanner = useRef<Html5Qrcode | null>(null)
  const lastCode = useRef<{ code: string; at: number }>({ code: '', at: 0 })

  useEffect(() => {
    api.myEvents().then((all) => {
      const now = Date.now()
      setEvents(all.filter((e) => e.status === 'APPROVED' && new Date(e.endAt).getTime() > now - 86_400_000))
    }).catch(() => setEvents([]))
  }, [])

  const inFlight = useRef(false)
  const submit = useCallback(async (code: string) => {
    // One check-in at a time, and the camera reports the same code many times a
    // second - ignore repeats, or a second "already checked in" would replace the success.
    const now = Date.now()
    if (inFlight.current) return
    if (code === lastCode.current.code && now - lastCode.current.at < 3000) return
    lastCode.current = { code, at: now }
    inFlight.current = true
    try {
      const result = await api.checkIn(code, eventId ? Number(eventId) : undefined)
      setOutcome({ ok: true, result })
      setLog((l) => [result, ...l].slice(0, 20))
    } catch (e) {
      setOutcome({ ok: false, message: e instanceof ApiError ? e.message : 'Check-in failed.' })
    } finally {
      inFlight.current = false
    }
  }, [eventId])

  const submitRef = useRef(submit)
  useEffect(() => { submitRef.current = submit }, [submit])

  async function start() {
    setCamError('')
    try {
      const s = new Html5Qrcode('qr-reader', { verbose: false })
      scanner.current = s
      await s.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } },
        (text) => submitRef.current(text), () => {})
      setScanning(true)
    } catch {
      setCamError('Could not open the camera. Allow camera access, or type the ticket code below.')
      scanner.current = null
    }
  }

  async function stop() {
    try { await scanner.current?.stop() } catch { /* already stopped */ }
    scanner.current = null
    setScanning(false)
  }

  useEffect(() => () => { scanner.current?.stop().catch(() => {}) }, [])

  const flash = useSpring({
    from: { scale: 0.96, opacity: 0 },
    to: { scale: 1, opacity: outcome ? 1 : 0 },
    reset: true,
    config: springs.snappy,
  })

  return (
    <Page>
      <PageHeader eyebrow="Door check-in" title="Scan" accent="tickets.">
        {eventId && <LinkButton to={`/organizer/events/${eventId}/wall`} variant="ghost" target="_blank">Open live wall ↗</LinkButton>}
      </PageHeader>
      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_380px]">
        <Glass className="p-6">
          <Field label="Event (optional - rejects tickets for other events)">
            <Select value={eventId} onChange={(e) => setEventId(e.target.value)}>
              <option value="">Any of my events</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.title} · {formatDate(e.startAt)}</option>)}
            </Select>
          </Field>
          <div className="relative mt-6 grid aspect-square max-h-[440px] w-full place-items-center overflow-hidden rounded-card border border-border-strong bg-background-deep">
            <div id="qr-reader" className="size-full" />
            {!scanning && (
              <div className="absolute inset-0 grid place-items-center p-6 text-center">
                <div>
                  <p className="text-sm text-foreground-muted">Point the camera at an attendee's QR ticket.</p>
                  <Button onClick={start} className="mt-4">Start camera</Button>
                </div>
              </div>
            )}
          </div>
          {camError && <p className="mt-3 text-sm text-warning">{camError}</p>}
          {scanning && <Button variant="ghost" onClick={stop} className="mt-4">Stop camera</Button>}

          <form className="mt-8 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-end"
            onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { lastCode.current.code = ''; submit(manual.trim()); setManual('') } }}>
            <div className="flex-1">
              <Field label="Or enter the ticket code">
                <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="e.g. 3f2a9c1e-…" className="font-mono" />
              </Field>
            </div>
            <Button type="submit" variant="ghost" className="h-[46px]">Check in</Button>
          </form>
        </Glass>

        <div className="flex flex-col gap-6">
          <animated.div style={{ opacity: flash.opacity, transform: flash.scale.to((s) => `scale(${s})`) }}>
            {outcome && (outcome.ok ? (
              <Glass className="border-accent/50 p-6 shadow-[0_0_60px_-10px_var(--accent-glow)]">
                <p className="text-xs font-semibold uppercase tracking-eyebrow text-accent">✓ Checked in</p>
                <p className="mt-3 text-2xl font-semibold">{outcome.result.attendeeName}</p>
                <p className="text-sm text-foreground-muted">{outcome.result.attendeeEmail}</p>
                <p className="mt-3 text-sm text-foreground-subtle">{outcome.result.eventTitle} · {formatTime(outcome.result.checkedInAt)}</p>
              </Glass>
            ) : (
              <Glass className="border-danger/50 p-6">
                <p className="text-xs font-semibold uppercase tracking-eyebrow text-danger">✕ Not admitted</p>
                <p className="mt-3 text-base">{outcome.message}</p>
              </Glass>
            ))}
          </animated.div>
          <Glass className="p-6">
            <h2 className="text-sm font-medium text-foreground-muted">This session · {log.length}</h2>
            {log.length === 0 ? <p className="mt-4 text-sm text-foreground-subtle">Scanned attendees appear here.</p> : (
              <ul className="mt-4 flex flex-col gap-3">
                {log.map((r, i) => (
                  <li key={`${r.attendeeEmail}-${i}`} className="flex items-center justify-between text-sm">
                    <span>{r.attendeeName}</span>
                    <span className="text-foreground-subtle">{formatTime(r.checkedInAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Glass>
        </div>
      </div>
    </Page>
  )
}
