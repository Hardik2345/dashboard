const express = require("express");
const { verifyTodoistHmac } = require("../services/todoistHmac");
const { processTodoistWebhook } = require("../services/webhookService");

function buildWebhookRouter(config) {
  const router = express.Router();

  router.post("/", async (req, res, next) => {
    try {
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");
      const signature = req.headers["x-todoist-hmac-sha256"];
      if (!verifyTodoistHmac(rawBody, signature, config.todoist.clientSecret)) {
        return res.status(401).json({ error: "invalid_todoist_signature" });
      }

      let payload = {};
      try {
        payload = JSON.parse(rawBody.toString("utf8") || "{}");
      } catch {
        return res.status(400).json({ error: "invalid_json" });
      }

      const result = await processTodoistWebhook(
        payload,
        req.headers["x-todoist-delivery-id"] || "",
        config,
      );
      return res.json({ ok: true, ...result });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = { buildWebhookRouter };
