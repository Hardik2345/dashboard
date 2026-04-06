const { Server } = require("socket.io");

let io;

/**
 * Initialize Socket.io with an existing HTTP server.
 * @param {import('http').Server} httpServer 
 */
const init = (httpServer) => {
  io = new Server(httpServer, {
    path: "/api/tenant/socket.io", // Ensure this matches the Nginx/Gateway proxy path
    cors: {
      origin: process.env.CORS_ORIGIN || "*",
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {
    console.log(`[Socket] New client connected: ${socket.id}`);

    socket.on("disconnect", () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

/**
 * Get the initialized IO instance.
 */
const getIO = () => {
  if (!io) {
    throw new Error("Socket.io has not been initialized!");
  }
  return io;
};

/**
 * Broadcast an onboarding log event.
 * @param {Object} logData - { brand_id, brand_name, log }
 */
const emitOnboardingLog = (logData) => {
  if (io) {
    // For "safe and recommended": we could emit to a room join(logData.brand_id)
    // But for now, user just asked to receive and show.
    // We'll broadcast to the 'onboarding-logs' channel.
    io.emit("onboarding-log", logData);
  }
};

module.exports = {
  init,
  getIO,
  emitOnboardingLog
};
