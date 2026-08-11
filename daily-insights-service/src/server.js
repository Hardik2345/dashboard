require("dotenv").config();

const { buildApp } = require("./app");

function start() {
  const { app, config } = buildApp();

  if (!config.gatewaySharedSecret) {
    if (config.allowInsecureAuth) {
      console.warn(
        "[daily-insights] WARNING: GATEWAY_SHARED_SECRET is unset and ALLOW_INSECURE_AUTH=true — gateway identity headers are trusted UNSIGNED. Dev/test only; never use in production.",
      );
    } else {
      console.warn(
        "[daily-insights] GATEWAY_SHARED_SECRET is not set — all gateway requests will be rejected (401). Set the secret, or ALLOW_INSECURE_AUTH=true for local dev.",
      );
    }
  }

  app.listen(config.port, () => {
    console.log(`[daily-insights] listening on :${config.port}`);
  });
}

start();
