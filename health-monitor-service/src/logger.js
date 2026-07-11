const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function createLogger(level = "info") {
  const maxLevel = LEVELS[level] ?? LEVELS.info;

  function write(kind, message, meta) {
    if ((LEVELS[kind] ?? LEVELS.info) > maxLevel) {
      return;
    }

    const payload = {
      ts: new Date().toISOString(),
      level: kind,
      service: "health-monitor-service",
      message,
    };

    if (meta && Object.keys(meta).length > 0) {
      payload.meta = meta;
    }

    const line = JSON.stringify(payload);
    if (kind === "error") {
      console.error(line);
      return;
    }
    console.log(line);
  }

  return {
    error(message, meta) {
      write("error", message, meta);
    },
    warn(message, meta) {
      write("warn", message, meta);
    },
    info(message, meta) {
      write("info", message, meta);
    },
    debug(message, meta) {
      write("debug", message, meta);
    },
  };
}

module.exports = { createLogger };
