const { Server } = require("socket.io");
const { getAllowedBrands } = require("./permissions");
const { setIO } = require("./realtime");
const { verifyJwt } = require("../middleware/auth");

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "https://datum.trytechit.co",
  "https://www.datum.trytechit.co",
];

function roomsForPrincipal(principal) {
  const rooms = [];
  if (principal?.isAuthor) rooms.push("role:author");
  for (const brand of getAllowedBrands(principal)) {
    rooms.push(`brand:${brand}`);
  }
  return rooms;
}

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
    for (const room of roomsForPrincipal(principal)) {
      socket.join(room);
    }

    socket.on("join", () => {
      socket.emit("merchant-request:error", { error: "manual_room_join_not_allowed" });
    });
  });

  setIO(io);
  return io;
}

module.exports = { initSocket, roomsForPrincipal };
