const { Server } = require("socket.io");

let io;

function initSocket(httpServer) {
    // CORS configuration should match your app's needs
    // Allowing * for now to prevent connectivity issues during dev
    io = new Server(httpServer, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    io.on('connection', (socket) => {
        // console.log('Socket connected:', socket.id);
    });

    return io;
}

function getIO() {
    if (!io) {
        throw new Error("Socket.IO not initialized!");
    }
    return io;
}

module.exports = { initSocket, getIO };
