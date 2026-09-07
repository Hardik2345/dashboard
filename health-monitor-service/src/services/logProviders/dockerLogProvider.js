const { createDockerEngineClient } = require("../dockerEngineClient");
const { withTimeout } = require("../../utils/withTimeout");

function createDockerLogProvider({
  socketPath,
  timeoutMs,
  tail,
  logger,
  dockerClient = createDockerEngineClient({ socketPath }),
}) {
  async function getRecentLogs(serviceName) {
    return withTimeout(async () => {
      const containers = await dockerClient.listContainersByService(serviceName);
      if (!containers.length) {
        throw new Error(`container_not_found:${serviceName}`);
      }

      const containerId = containers[0].Id;
      const logs = await dockerClient.getContainerLogs(containerId, tail);
      const lines = String(logs || "")
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(-tail);

      return {
        containerId,
        lines,
      };
    }, timeoutMs, `docker_logs:${serviceName}`).catch((error) => {
      logger.warn("evidence.logs_failed", {
        serviceName,
        error: error.message,
      });
      throw error;
    });
  }

  return {
    getRecentLogs,
  };
}

module.exports = { createDockerLogProvider };
