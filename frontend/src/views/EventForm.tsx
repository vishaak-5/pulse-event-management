import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Page } from '../components/Layout'
import { useToast } from '../components/Toast'
import { Button, ErrorNote, Field, Glass, Input, Loading, PageHeader, Select, Textarea } from '../components/ui'
import { api } from '../lib/api'
import { fromLocalInput, titleCase, toLocalInput } from '../lib/format'
import { Inview } from '../lib/motion/Inview'
import { CATEGORIES, type EventRequest } from '../lib/types'

function defaultStart(): string {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  d.setHours(10, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`
}

function plusHours(local: string, h: number): string {
  const d = new Date(local)
  d.setHours(d.getHours() + h)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Create (no :id) or edit (with :id) an event. */
export function EventForm() {
  const { id } = useParams()
  const editing = id !== undefined
  const navigate = useNavigate()
  const toast = useToast()
  const start = defaultStart()
  const [form, setForm] = useState<EventRequest>({
    title: '', description: '', category: 'TECH', venue: '', startAt: start, endAt: plusHours(start, 3), capacity: 100,
  })
  const [loading, setLoading] = useState(editing)
  const [rejection, setRejection] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!editing) return
    api.event(Number(id)).then((e) => {
      setForm({
        title: e.title, description: e.description, category: e.category, venue: e.venue,
        startAt: toLocalInput(e.startAt), endAt: toLocalInput(e.endAt), capacity: e.capacity,
      })
      if (e.status === 'REJECTED') setRejection(e.rejectionReason ?? 'No reason given.')
    }).catch((e: Error) => setError(e.message)).finally(() => setLoading(false))
  }, [editing, id])

  const set = <K extends keyof EventRequest>(k: K, v: EventRequest[K]) => setForm((f) => ({ ...f, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const body = { ...form, startAt: fromLocalInput(form.startAt), endAt: fromLocalInput(form.endAt) }
    try {
      const saved = editing ? await api.updateEvent(Number(id), body) : await api.createEvent(body)
      toast(editing ? 'Event updated.' : saved.status === 'PENDING' ? 'Event submitted for approval.' : 'Event published.')
      navigate(`/organizer/events/${saved.id}`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Page><Loading /></Page>

  return (
    <Page className="max-w-3xl">
      <PageHeader eyebrow={editing ? 'Edit event' : 'New event'} title={editing ? 'Fine-tune' : 'Create an'} accent={editing ? 'the details.' : 'event.'} />
      <Inview className="mt-10">
        <Glass tag="form" className="flex flex-col gap-6 p-6 md:p-8">
          {rejection && <ErrorNote message={`An admin asked for changes: ${rejection} Saving will send it for review again.`} />}
          {error && <ErrorNote message={error} />}
          <Field label="Title">
            <Input required maxLength={150} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Build Night: 24h Hackathon" />
          </Field>
          <Field label="Description">
            <Textarea required maxLength={5000} value={form.description} onChange={(e) => set('description', e.target.value)}
              placeholder="What happens, who it's for, what to bring" />
          </Field>
          <div className="grid gap-6 md:grid-cols-2">
            <Field label="Category">
              <Select value={form.category} onChange={(e) => set('category', e.target.value as EventRequest['category'])}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
              </Select>
            </Field>
            <Field label="Capacity" hint="When full, new sign-ups join the waitlist">
              <Input type="number" min={1} max={100000} required value={form.capacity}
                onChange={(e) => set('capacity', Number(e.target.value))} />
            </Field>
          </div>
          <Field label="Venue">
            <Input required maxLength={200} value={form.venue} onChange={(e) => set('venue', e.target.value)} placeholder="e.g. Seminar Hall 2" />
          </Field>
          <div className="grid gap-6 md:grid-cols-2">
            <Field label="Starts">
              <Input type="datetime-local" required value={form.startAt}
                onChange={(e) => { const v = e.target.value; setForm((f) => ({ ...f, startAt: v, endAt: f.endAt <= v ? plusHours(v, 3) : f.endAt })) }} />
            </Field>
            <Field label="Ends">
              <Input type="datetime-local" required value={form.endAt} min={form.startAt} onChange={(e) => set('endAt', e.target.value)} />
            </Field>
          </div>
          <div className="flex justify-end gap-3 border-t border-border pt-6">
            <Button type="button" variant="subtle" onClick={() => navigate(-1)}>Cancel</Button>
            <Button type="submit" busy={busy} onClick={submit}>{editing ? 'Save changes' : 'Submit event'}</Button>
          </div>
        </Glass>
      </Inview>
    </Page>
  )
}
