const { verifyGatewaySignature, buildPrincipalFromHeaders } = require("../shared/middleware/identityEdge");

function getDeniedResponse(res) {
  return res.status(403).json({
    success: false,
    message: "Access denied",
  });
}

function checkSessionAnalyticsPermission(req, res, next) {
  if (!verifyGatewaySignature(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const principal = buildPrincipalFromHeaders(req);
  if (!principal) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  req.user = principal;
  req.isAuthenticated = () => true;

  if (
    principal.isAuthor ||
    (principal.permissions && principal.permissions.includes("all")) ||
    (principal.permissions && principal.permissions.includes("session_analytics"))
  ) {
    return next();
  }

  return getDeniedResponse(res);
}

module.exports = {
  checkSessionAnalyticsPermission,
};
