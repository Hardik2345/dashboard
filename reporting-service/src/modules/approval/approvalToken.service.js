const crypto = require("crypto");
const { env } = require("../../config/env");

function generateApprovalToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashApprovalToken(token) {
  return crypto.createHash("sha256").update(`${token}${env.APPROVAL_TOKEN_SECRET}`).digest("hex");
}

module.exports = { generateApprovalToken, hashApprovalToken };
