const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
}, { collection: 'counters' });

const Counter = mongoose.model('Counter', counterSchema);

async function getNextSeq(name) {
  const res = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return res.seq;
}

module.exports = { getNextSeq };
