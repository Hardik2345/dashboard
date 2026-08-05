function createSchedulerService({
  logger,
  registryService,
  executorService,
  retryService,
  incidentService,
  monitorRunService,
}) {
  const timers = new Map();

  function getTimerKey(serviceName, endpoint) {
    return `${serviceName}::${endpoint.method}::${endpoint.path}`;
  }

  async function runEndpointCheck(serviceDoc, endpoint) {
    const endpointName = `${endpoint.method} ${endpoint.path}`;
    const { result, exhausted, attempts } = await retryService.run(
      () => executorService.executeCheck(serviceDoc, endpoint),
      { serviceName: serviceDoc.serviceName, endpoint: endpointName },
    );

    await monitorRunService.record(result);

    if (result.status === "SUCCESS") {
      await incidentService.resolveIncident({
        serviceName: serviceDoc.serviceName,
        endpoint: endpointName,
      });
      return result;
    }

    if (exhausted) {
      await incidentService.openIncident({
        serviceName: serviceDoc.serviceName,
        endpoint: endpointName,
        critical: endpoint.critical,
        failure: result,
        retryAttempts: attempts,
        serviceDoc,
      });
    }

    return result;
  }

  async function scheduleService(serviceDoc) {
    for (const endpoint of serviceDoc.endpoints || []) {
      const key = getTimerKey(serviceDoc.serviceName, endpoint);
      if (timers.has(key)) {
        continue;
      }

      const intervalMs = Number(endpoint.intervalSeconds) * 1000;
      const timer = setInterval(() => {
        runEndpointCheck(serviceDoc, endpoint).catch((error) => {
          logger.error("health.schedule_run_failed", {
            serviceName: serviceDoc.serviceName,
            endpoint: `${endpoint.method} ${endpoint.path}`,
            error: error.message,
          });
        });
      }, intervalMs);

      timer.unref?.();
      timers.set(key, timer);

      runEndpointCheck(serviceDoc, endpoint).catch((error) => {
        logger.error("health.initial_run_failed", {
          serviceName: serviceDoc.serviceName,
          endpoint: `${endpoint.method} ${endpoint.path}`,
          error: error.message,
        });
      });
    }
  }

  async function rebuild() {
    const services = await registryService.listServices();
    for (const [key, timer] of timers.entries()) {
      clearInterval(timer);
      timers.delete(key);
    }

    for (const serviceDoc of services) {
      await scheduleService(serviceDoc);
    }

    logger.info("scheduler.rebuilt", {
      services: services.length,
      timers: timers.size,
    });
  }

  function stopAll() {
    for (const timer of timers.values()) {
      clearInterval(timer);
    }
    timers.clear();
  }

  return {
    rebuild,
    stopAll,
    timers,
  };
}

module.exports = { createSchedulerService };
