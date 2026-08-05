// Structured logger. Wraps console methods for consistent call-site interface.
// Canonical location. Cleaned from utils/logger.js (removed dead commented-out code).

const base = {
  debug: console.debug ? console.debug.bind(console) : console.log.bind(console),
  info: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

function log(fn, args) {
  fn(...args);
}

module.exports = {
  debug: (...args) => log(base.debug, args),
  info: (...args) => log(base.info, args),
  warn: (...args) => log(base.warn, args),
  error: (...args) => log(base.error, args),
};
