import mongoose from 'mongoose'

// Numeric ids (1, 2, 3...) like a SQL identity column: friendlier in URLs and the
// React app treats ids as numbers. One counter document per collection.
const Counter = mongoose.model('Counter', new mongoose.Schema({
  _id: String,
  seq: { type: Number, default: 0 },
}, { versionKey: false }))

export async function nextId(name) {
  const c = await Counter.findByIdAndUpdate(name, { $inc: { seq: 1 } }, { new: true, upsert: true })
  return c.seq
}

/** Schema options shared by every collection: numeric _id assigned on first save. */
export function withNumericId(schema, name) {
  schema.pre('save', async function assignId() {
    if (this.isNew && this._id == null) this._id = await nextId(name)
  })
}

export default Counter
