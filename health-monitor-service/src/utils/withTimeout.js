function withTimeout(task, timeoutMs, label) {
  let timer = null;

  return Promise.race([
    Promise.resolve().then(task),
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error(`${label} timed out after ${timeoutMs}ms`);
        error.code = "TIMEOUT";
        reject(error);
      }, timeoutMs);
      timer.unref?.();
    }),
  ]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

module.exports = { withTimeout };
