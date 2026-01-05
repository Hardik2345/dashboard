require('dotenv').config();

const { init, sequelize } = require('./app');
const { closeAll: closeBrandConnections } = require('./lib/brandConnectionManager');
const logger = require('./utils/logger');

let server = null;

async function gracefulShutdown(signal) {
  logger.info(`[${signal}] Graceful shutdown initiated...`);

    // Stop accepting new connections
  if (server) {
    server.close(() => {
      logger.info('[shutdown] HTTP server closed.');
    });
  }

  try {
    // Close all brand database connection pools
    await closeBrandConnections();

    // Close main database connection pool
    await sequelize.close();
    logger.info('[shutdown] Main database connection closed.');

    logger.info('[shutdown] Graceful shutdown complete.');
    
    // Small delay to ensure logs are flushed to stdout before exit
    await new Promise(resolve => setTimeout(resolve, 500));
    process.exit(0);
  } catch (e) {
    logger.error('[shutdown] Error during graceful shutdown:', e.message);
    await new Promise(resolve => setTimeout(resolve, 500));
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors gracefully
process.on('uncaughtException', (err) => {
  logger.error('[uncaughtException]', err);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('[unhandledRejection] at:', promise, 'reason:', reason);
  // Don't exit on unhandled rejection, just log it
});

init()
  .then((httpServer) => {
    server = httpServer;
  })
  .catch((e) => {
    logger.error('Startup failure', e);
    process.exit(1);
  });
