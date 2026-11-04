// Real-time push over Server-Sent Events, on two channels:
//  - check-ins, for the organizer's live wall;
//  - seat counts, for anyone viewing a public event page.
// Each channel maps an event id to the set of open responses.

const walls = new Map()
const seatViewers = new Map()

function open(channel, eventId, req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders()
  let set = channel.get(eventId)
  if (!set) channel.set(eventId, (set = new Set()))
  set.add(res)
  req.on('close', () => {
    set.delete(res)
    if (!set.size) channel.delete(eventId)
  })
  res.write('event: ready\ndata: ok\n\n')
}

function broadcast(channel, eventId, name, payload) {
  const set = channel.get(eventId)
  if (!set) return
  const frame = `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`
  for (const res of set) res.write(frame)
}

export const subscribeWall = (eventId, req, res) => open(walls, eventId, req, res)
export const subscribeSeats = (eventId, req, res) => open(seatViewers, eventId, req, res)
export const pushCheckIn = (eventId, payload) => broadcast(walls, eventId, 'checkin', payload)
export const hasSeatViewers = (eventId) => seatViewers.has(eventId)
export const pushSeats = (eventId, payload) => broadcast(seatViewers, eventId, 'seats', payload)

/** Keeps idle connections open through proxies (Render closes silent ones). */
export function startHeartbeat() {
  const timer = setInterval(() => {
    for (const channel of [walls, seatViewers]) {
      for (const set of channel.values()) for (const res of set) res.write(': ping\n\n')
    }
  }, 20_000)
  timer.unref()
  return timer
}

/** Closes every stream (shutdown and tests). */
export function closeAll() {
  for (const channel of [walls, seatViewers]) {
    for (const set of channel.values()) for (const res of set) res.end()
    channel.clear()
  }
}
