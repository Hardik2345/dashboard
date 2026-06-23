const crypto = require("crypto");

function computeTodoistHmac(rawBody, clientSecret) {
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody || "");
  return crypto.createHmac("sha256", clientSecret).update(body).digest("base64");
}

function verifyTodoistHmac(rawBody, signature, clientSecret) {
  if (!clientSecret || !signature) return false;
  const expected = computeTodoistHmac(rawBody, clientSecret);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(String(signature));
  if (expectedBuffer.length !== signatureBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

module.exports = {
  computeTodoistHmac,
  verifyTodoistHmac,
};
