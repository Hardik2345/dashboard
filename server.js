require('dotenv').config();

const { init, sequelize } = require('./app');
const { closeAll: closeBrandConnections } = require('./lib/brandConnectionManager');

let server = null;

async function gracefulShutdown(signal) {
  console.log(`\n[${signal}] Graceful shutdown initiated...`);

  // Stop accepting new connections
  if (server) {
    server.close(() => {
      console.log('[shutdown] HTTP server closed.');
    });
  }

  try {
    // Close all brand database connection pools
    await closeBrandConnections();

    // Close main database connection pool
    await sequelize.close();
    console.log('[shutdown] Main database connection closed.');

    console.log('[shutdown] Graceful shutdown complete.');
    process.exit(0);
  } catch (e) {
    console.error('[shutdown] Error during graceful shutdown:', e.message);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors gracefully
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[unhandledRejection] at:', promise, 'reason:', reason);
  // Don't exit on unhandled rejection, just log it
});

init()
  .then((httpServer) => {
    server = httpServer;
  })
  .catch((e) => {
    console.error('Startup failure', e);
    process.exit(1);
  });
