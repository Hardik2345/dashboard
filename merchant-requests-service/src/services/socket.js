const { Server } = require("socket.io");
const { getAllowedBrands } = require("./permissions");
const { setIO } = require("./realtime");
const { verifyJwt } = require("../middleware/auth");

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "https://datum.trytechit.co",
  "https://www.datum.trytechit.co",
];

function initSocket(httpServer, config) {
  const allowedOrigins = config.corsOrigins.length
    ? Array.from(new Set([...DEFAULT_ALLOWED_ORIGINS, ...config.corsOrigins]))
    : DEFAULT_ALLOWED_ORIGINS;

  const io = new Server(httpServer, {
    path: "/api/merchant-requests/socket.io",
    cors: {
      origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        return cb(new Error(`Origin not allowed: ${origin}`));
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || "";
      if (!token) throw new Error("missing_token");
      const principal = verifyJwt(token, config);
      socket.data.principal = principal;
      return next();
    } catch {
      return next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const principal = socket.data.principal;
    if (principal?.isAuthor) socket.join("role:author");
    for (const brand of getAllowedBrands(principal)) {
      socket.join(`brand:${brand}`);
    }

    socket.on("join", () => {
      socket.emit("merchant-request:error", { error: "manual_room_join_not_allowed" });
    });
  });

  setIO(io);
  return io;
}

module.exports = { initSocket };
