require("dotenv").config();

const { getConfig } = require("./config");
const { createLogger } = require("./logger");
const { connectMongo, disconnectMongo } = require("./db/mongo");
const { createRegistryService } = require("./services/registryService");
const { createMonitorRunService } = require("./services/monitorRunService");
const { createEmailService } = require("./services/emailService");
const { createIncidentService } = require("./services/incidentService");
const { createExecutorService } = require("./services/executorService");
const { createRetryService } = require("./services/retryService");
const { createSchedulerService } = require("./services/schedulerService");
const { createRegistrationValidationService } = require("./services/registrationValidationService");
const { createNotificationAuditService } = require("./services/notificationAuditService");
const { createDockerLogProvider } = require("./services/logProviders/dockerLogProvider");
const { createEvidenceService } = require("./services/evidenceService");
const { createIncidentEnrichmentService } = require("./services/incidentEnrichmentService");
const { createRouteCatalogService } = require("./services/routeCatalogService");
const { createApplicationEventService } = require("./services/applicationEventService");
const { buildApp } = require("./app");

async function start() {
  const config = getConfig();
  const logger = createLogger(config.logLevel);

  await connectMongo({
    mongoUri: config.mongoUri,
    mongoDb: config.mongoDb,
  });

  const routeCatalogService = createRouteCatalogService({ logger });
  const registryService = createRegistryService({
    logger,
    defaultEndpointIntervalSeconds: config.defaultEndpointIntervalSeconds,
    routeCatalogService,
  });
  const monitorRunService = createMonitorRunService({
    responseSummaryMaxLength: config.responseSummaryMaxLength,
  });
  const notificationAuditService = createNotificationAuditService();
  const emailService = createEmailService({
    logger,
    smtp: config.smtp,
    notificationAuditService,
    openIncidentEmailReminderIntervalMs: config.openIncidentEmailReminderIntervalMs,
  });
  const logProvider = createDockerLogProvider({
    socketPath: config.dockerSocketPath,
    timeoutMs: config.dockerLogTimeoutMs,
    tail: config.healthLogLines,
    logger,
  });
  const evidenceService = createEvidenceService({
    logger,
    logProvider,
    healthProbeTimeoutMs: config.healthProbeTimeoutMs,
    dependencyCheckTimeoutMs: config.dependencyCheckTimeoutMs,
    dockerLogTimeoutMs: config.dockerLogTimeoutMs,
    apiResponseEvidenceTimeoutMs: config.apiResponseEvidenceTimeoutMs,
  });
  const incidentEnrichmentService = createIncidentEnrichmentService({
    logger,
    evidenceService,
    emailService,
    emailLogTruncationLength: config.emailLogTruncationLength,
  });
  const incidentService = createIncidentService({
    logger,
    emailService,
    incidentEnrichmentService,
    openIncidentEmailReminderIntervalMs: config.openIncidentEmailReminderIntervalMs,
  });
  const applicationEventService = createApplicationEventService({
    logger,
    incidentService,
    fourXxThresholdCount: config.applicationFailureFourXxThresholdCount,
    fourXxThresholdWindowMs: config.applicationFailureFourXxWindowMs,
    reopenCooldownMs: config.applicationFailureReopenCooldownMs,
    payloadStringMaxLength: config.applicationEventPayloadMaxLength,
    headerValueMaxLength: config.applicationEventHeaderValueMaxLength,
  });
  const executorService = createExecutorService({
    logger,
    requestTimeoutMs: config.requestTimeoutMs,
  });
  const retryService = createRetryService({
    logger,
    retryCount: config.retryCount,
    retryIntervalMs: config.retryIntervalMs,
  });
  const schedulerService = createSchedulerService({
    logger,
    registryService,
    executorService,
    retryService,
    incidentService,
    monitorRunService,
  });
  const registrationValidationService = createRegistrationValidationService({
    logger,
    schedulerService,
    validationIntervalHours: config.registrationValidationIntervalHours,
    requestTimeoutMs: config.requestTimeoutMs,
  });

  const app = buildApp({
    logger,
    registryService,
    schedulerService,
    applicationEventService,
  });

  const server = app.listen(config.port, () => {
    logger.info("startup.complete", { port: config.port });
  });

  registrationValidationService.start();
  await schedulerService.rebuild();

  const shutdown = async () => {
    registrationValidationService.stop();
    schedulerService.stopAll();
    server.close(() => undefined);
    await disconnectMongo();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return {
    app,
    server,
    services: {
      registryService,
      schedulerService,
      registrationValidationService,
      incidentService,
      incidentEnrichmentService,
      emailService,
      evidenceService,
      notificationAuditService,
      executorService,
      retryService,
      monitorRunService,
      routeCatalogService,
      applicationEventService,
    },
  };
}

if (require.main === module) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { start };
