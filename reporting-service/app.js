require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { connectMongo } = require("./src/config/mongo");
const { env } = require("./src/config/env");
const logger = require("./src/utils/logger");
const { errorHandler } = require("./src/utils/errors");
const { requireTrustedAuthor } = require("./src/middlewares/identityEdge");
const { tenantScope } = require("./src/middlewares/tenantScope");
const { buildReportDefinitionsRouter } = require("./src/modules/report-definitions/routes");
const { buildReportRunsRouter } = require("./src/modules/report-runs/routes");
const { buildTaskCategoriesRouter } = require("./src/modules/task-categories/routes");
const { buildLoggedTasksRouter } = require("./src/modules/logged-tasks/routes");
const { buildApprovalRouter } = require("./src/modules/approval/routes");
const { startScheduler } = require("./src/modules/scheduler/worker");

const app = express();

app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "reporting" });
});

app.use("/report-approval", buildApprovalRouter());

const protectedRouters = express.Router();
protectedRouters.use(requireTrustedAuthor, tenantScope);
protectedRouters.use("/definitions", buildReportDefinitionsRouter());
protectedRouters.use("/runs", buildReportRunsRouter());
protectedRouters.use("/task-categories", buildTaskCategoriesRouter());
protectedRouters.use("/logged-tasks", buildLoggedTasksRouter());
app.use("/reports", protectedRouters);

app.use(errorHandler);

async function init() {
  await connectMongo();
  const server = app.listen(env.PORT, () => {
    logger.info(`[reporting-service] listening on :${env.PORT}`);
  });

  if (env.SCHEDULER_ENABLED) {
    startScheduler();
  }

  return server;
}

module.exports = { app, init };
