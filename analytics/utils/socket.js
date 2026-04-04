const { Server } = require("socket.io");
const logger = require("../shared/utils/logger");

let io = null;

function initSocket(server) {
  const allowedOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  io = new Server(server, {
    cors: {
      origin: allowedOrigins.length ? allowedOrigins : false,
      methods: ['GET', 'POST'],
    },
  });

  io.on("connection", (socket) => {
    logger.info(`New client connected: ${socket.id}`);
    
    socket.on("disconnect", () => {
      logger.info(`Client disconnected: ${socket.id}`);
    });
  });

  logger.info("Socket.io initialized");
  return io;
}

function getIO() {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
}

module.exports = {
  initSocket,
  getIO,
};
