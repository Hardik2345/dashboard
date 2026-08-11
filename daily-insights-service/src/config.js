function getConfig(env = process.env) {
  return {
    port: Number(env.PORT || 4030),
    corsOrigins: String(env.CORS_ORIGINS || env.CORS_ORIGIN || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    gatewaySharedSecret: env.GATEWAY_SHARED_SECRET || "",
    // Escape hatch for local dev / tests only: when no GATEWAY_SHARED_SECRET is
    // set, trust gateway identity headers unsigned. Never enable in production.
    allowInsecureAuth: String(env.ALLOW_INSECURE_AUTH || "").toLowerCase() === "true",
    authKeys: env.AUTH_KEYS || "",
    insightCharLimit: Number(env.INSIGHT_CHAR_LIMIT || 250),
  };
}

module.exports = { getConfig };
