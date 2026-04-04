function responseTime(req, res, next) {
  if (!req._reqStart) req._reqStart = Date.now();
  const start = req._reqStart;
  const origEnd = res.end;
  res.end = function patchedEnd(...args) {
    const duration = Date.now() - start;
    if (!res.headersSent) {
      res.setHeader('X-Response-Time', `${duration}ms`);
    }
    res.end = origEnd;
    return res.end(...args);
  };
  next();
}

module.exports = { responseTime };
