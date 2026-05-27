function write(level, args) {
  const fn = console[level] || console.log;
  fn(new Date().toISOString(), ...args);
}

module.exports = {
  debug: (...args) => write("debug", args),
  info: (...args) => write("log", args),
  warn: (...args) => write("warn", args),
  error: (...args) => write("error", args),
};
