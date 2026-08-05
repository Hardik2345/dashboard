exports.getClientIp = (req) => {
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    // If multiple IPs are listed, return the first one (most accurate for the client)
    return xForwardedFor.split(',')[0].trim();
  }
  return req.socket.remoteAddress;
};
