require("dotenv").config();

const { init } = require("./app");
const logger = require("./src/utils/logger");

init().catch((err) => {
  logger.error("[reporting-service] failed to start", err);
  process.exit(1);
});
