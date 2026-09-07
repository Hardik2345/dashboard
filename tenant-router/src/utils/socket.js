const { Server } = require("socket.io");

let io;

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "https://datum.trytechit.co",
  "https://www.datum.trytechit.co",
];

function parseAllowedOrigins() {
  const raw = [process.env.CORS_ORIGINS, process.env.CORS_ORIGIN]
    .filter(Boolean)
    .join(",");

  const origins = raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  if (origins.includes("*")) {
    return "*";
  }

  const deduped = Array.from(new Set([...DEFAULT_ALLOWED_ORIGINS, ...origins]));
  return deduped;
}

/**
 * Initialize Socket.io with an existing HTTP server.
 * @param {import('http').Server} httpServer 
 */
const init = (httpServer) => {
  const allowedOrigins = parseAllowedOrigins();

  io = new Server(httpServer, {
    path: "/api/tenant/socket.io", // Ensure this matches the Nginx/Gateway proxy path
    cors: {
      origin: (origin, callback) => {
        // Allow non-browser clients or same-origin calls with no Origin header.
        if (!origin) return callback(null, true);

        if (allowedOrigins === "*") {
          return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        return callback(new Error(`Origin not allowed by Socket.IO CORS: ${origin}`));
      },
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Authorization", "Content-Type", "x-pipeline-key"],
      credentials: true,
    }
  });

  io.on("connection", (socket) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers["authorization"];
    console.log(`[Socket] New client connected: ${socket.id} (Auth: ${token ? 'PROVIDED' : 'MISSING'})`);

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
