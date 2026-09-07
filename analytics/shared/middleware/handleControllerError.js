const logger = require('../utils/logger');

function handleControllerError(res, error, tag) {
  const status = error.status || 500;
  const message = error.status ? error.message : tag;
  logger.error(`[${tag}]`, error);
  return res.status(status).json({ error: message });
}

module.exports = { handleControllerError };
