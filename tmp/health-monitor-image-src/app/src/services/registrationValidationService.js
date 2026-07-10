const Service = require("../models/Service");
const { requestJson } = require("./httpClient");

function createRegistrationValidationService({
  logger,
  schedulerService,
  validationIntervalHours,
  requestTimeoutMs,
}) {
  let timer = null;

  async function validateServices() {
    const services = await Service.find({});

    for (const serviceDoc of services) {
      const url = `${String(serviceDoc.baseUrl || "").replace(/\/$/, "")}${serviceDoc.healthEndpoint}`;
      try {
        const response = await requestJson(url, {
          method: "GET",
          timeoutMs: requestTimeoutMs,
        });
        serviceDoc.status = response.ok ? "HEALTHY" : "UNREACHABLE";
      } catch (error) {
        serviceDoc.status = "UNREACHABLE";
        logger.warn("service.validation_failed", {
          serviceName: serviceDoc.serviceName,
          error: error.message,
        });
      }

      await serviceDoc.save();
    }

    await schedulerService.rebuild();
    logger.info("service.validation_completed", { services: services.length });
  }

  function start() {
    const intervalMs = validationIntervalHours * 60 * 60 * 1000;
    timer = setInterval(() => {
      validateServices().catch((error) => {
        logger.error("service.validation_tick_failed", { error: error.message });
      });
    }, intervalMs);
    timer.unref?.();
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return {
    start,
    stop,
    validateServices,
  };
}

module.exports = { createRegistrationValidationService };
