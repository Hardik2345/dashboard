const express = require("express");
const { verifyTodoistHmac } = require("../services/todoistHmac");
const { processTodoistWebhook } = require("../services/webhookService");

function webhookOutcome(payload = {}, deliveryId = "", result = {}) {
  const data = payload.event_data || {};
  return {
    delivery_id: String(deliveryId || ""),
    event_name: String(payload.event_name || ""),
    task_id: String(data.task_id || data.item_id || data.id || ""),
    outcome: result.duplicate ? "duplicate" : result.ignored ? "ignored" : "processed",
  };
}

function buildWebhookRouter(config, deps = {}) {
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
        deps,
      );
      console.info(
        "[merchant-requests] Todoist webhook",
        JSON.stringify(webhookOutcome(payload, req.headers["x-todoist-delivery-id"], result)),
      );
      return res.json({ ok: true, ...result });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = { buildWebhookRouter, webhookOutcome };
