// Entry point: connect to MongoDB, seed demo data if the database is empty,
// start the HTTP server and the background jobs.
import { assertConfig, config } from './config.js'
import { createApp } from './app.js'
import { connectDb, disconnectDb } from './lib/db.js'
import { closeAll, startHeartbeat } from './lib/live.js'
import { startReminders } from './services/reminders.js'
import { seedIfEmpty } from './seed.js'

assertConfig()
await connectDb()
if (config.seed.enabled) await seedIfEmpty(config.seed.password)

const server = createApp().listen(config.port, () => {
  console.log(`Pulse API listening on http://localhost:${config.port}`)
})
startHeartbeat()
startReminders()

async function shutdown(signal) {
  console.log(`${signal} received, shutting down`)
  closeAll()
  server.close()
  await disconnectDb()
  process.exit(0)
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
