const cron = require("node-cron");
const ReportDefinition = require("../../models/reportDefinition.model");
const logger = require("../../utils/logger");
const { generateReport } = require("../generation/reportGenerator.service");
const { acquireLock, releaseLock } = require("./locks.service");

function computeNextRunAt() {
  return new Date(Date.now() + 60 * 1000);
}

async function processDefinition(definition) {
  const lockKey = `reporting:definition:${definition._id}`;
  const lock = await acquireLock(lockKey);
  if (!lock.acquired) return;
  try {
    await generateReport({
      tenantId: definition.tenant_id,
      user: null,
      definitionId: definition._id,
      now: new Date(),
      preview: false,
    });
    await ReportDefinition.updateOne(
      { _id: definition._id },
      { $set: { "schedule.last_run_at": new Date(), "schedule.next_run_at": computeNextRunAt() } },
    );
  } catch (err) {
    logger.error("[reporting-service] scheduled report failed", {
      definitionId: String(definition._id),
      tenantId: definition.tenant_id,
      error: err.message,
    });
  } finally {
    await releaseLock(lockKey, lock.token);
  }
}

async function tick() {
  const due = await ReportDefinition.find({
    status: "active",
    "schedule.enabled": true,
    $or: [{ "schedule.next_run_at": null }, { "schedule.next_run_at": { $lte: new Date() } }],
  }).lean();
  for (const definition of due) {
    await processDefinition(definition);
  }
}

function startScheduler() {
  cron.schedule("* * * * *", () => {
    tick().catch((err) => logger.error("[reporting-service] scheduler tick failed", err));
  });
  logger.info("[reporting-service] scheduler started");
}

module.exports = { startScheduler, tick, computeNextRunAt };
