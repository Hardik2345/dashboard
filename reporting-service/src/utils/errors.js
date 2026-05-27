class HttpError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function notFound(message = "not_found") {
  return new HttpError(404, message);
}

function errorHandler(err, _req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const payload = {
    error: status >= 500 ? "internal_server_error" : err.message,
  };
  if (err.details) payload.details = err.details;
  if (status >= 500) {
    console.error(err);
  }
  res.status(status).json(payload);
}

module.exports = { HttpError, asyncHandler, notFound, errorHandler };
