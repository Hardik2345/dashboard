const { Server } = require("socket.io");
const logger = require("./logger");

let io = null;

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: "*", // Adjust this to your specific frontend URL in production
      methods: ["GET", "POST"]
    }
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

function emitKafkaMessage(message) {
  if (io) {
    io.emit("kafka-message", message);
    logger.info("Emitted kafka-message via socket", { message });
  }
}

module.exports = {
  initSocket,
  getIO,
  emitKafkaMessage
};
