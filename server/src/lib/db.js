import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mongoose from 'mongoose'
import { config } from '../config.js'

let memoryServer = null

/**
 * Connects to MONGODB_URI (Atlas in production). With no URI set - local
 * development only - it starts a private MongoDB that keeps its data in
 * server/.data/db, so nothing has to be installed to run the project.
 */
export async function connectDb() {
  let uri = config.mongoUri
  if (!uri) {
    const { MongoMemoryServer } = await import('mongodb-memory-server')
    const dbPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.data', 'db')
    fs.mkdirSync(dbPath, { recursive: true })
    memoryServer = await MongoMemoryServer.create({
      instance: { dbPath, storageEngine: 'wiredTiger', port: 27018 },
    })
    uri = memoryServer.getUri('pulse')
    console.log(`Local MongoDB started at ${uri} (data in server/.data/db)`)
  }
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000 })
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()))
  console.log(`Connected to MongoDB database "${mongoose.connection.name}"`)
}

export async function disconnectDb() {
  await mongoose.disconnect()
  if (memoryServer) await memoryServer.stop()
}
