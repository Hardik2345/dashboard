const crypto = require('crypto');

function computeBucketStart(ts = Date.now(), bucketMs = 10 * 60 * 1000) {
  const bucketTs = Math.floor(ts / bucketMs) * bucketMs;
  return new Date(bucketTs);
}

function formatDateTimeUTC(date) {
  if (!(date instanceof Date)) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function hashIp(ip) {
  const rawIp = (ip || '').toString().trim();
  if (!rawIp) return null;
  try {
    return crypto.createHash('sha256').update(rawIp).digest('hex');
  } catch {
    return null;
  }
}

module.exports = {
  computeBucketStart,
  formatDateTimeUTC,
  hashIp,
};
