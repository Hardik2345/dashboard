let io = null;

function setIO(nextIO) {
  io = nextIO;
}

function emitRequestEvent(eventName, request, payload = {}) {
  if (!io || !request?.brand_key) return;
  io.to(`brand:${request.brand_key}`).to("role:author").emit(eventName, {
    request_id: String(request._id),
    brand_key: request.brand_key,
    request: payload.request || request,
    ...payload,
  });
}

module.exports = {
  emitRequestEvent,
  setIO,
};
