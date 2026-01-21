const enabled = process.env.NODE_ENV !== 'production';
const noop = () => { };
const base = {
  debug: console.debug ? console.debug.bind(console) : console.log.bind(console),
  info: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

if (!enabled) {
  console.debug = noop;
  console.log = noop;
  console.info = noop;
  console.warn = noop;
  console.error = noop;
}

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
