const enabled = true; // Enable logging by default
const noop = () => {};
const base = {
  debug: console.debug ? console.debug.bind(console) : console.log.bind(console),
  info: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

// Removed global console suppression to allow direct console.log usage

function log(fn, args) {
  if (!enabled) return;
  fn(...args);
}

module.exports = {
  debug: (...args) => log(base.debug, args),
  info: (...args) => log(base.info, args),
  warn: (...args) => log(base.warn, args),
  error: (...args) => log(base.error, args),
};
