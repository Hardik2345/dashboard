function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createRetryService({ logger, retryCount, retryIntervalMs }) {
  async function run(task, meta = {}) {
    let result = await task();
    let attempts = 0;

    while (result.status !== "SUCCESS" && attempts < retryCount) {
      attempts += 1;
      logger.warn("health.retry", {
        ...meta,
        attempt: attempts,
        retryCount,
      });
      await sleep(retryIntervalMs);
      result = await task();
    }

    return {
      result,
      attempts,
      exhausted: result.status !== "SUCCESS",
    };
  }

  return {
    run,
  };
}

module.exports = { createRetryService };
