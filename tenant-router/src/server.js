const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const app = require('./app');
const connectDB = require('./utils/db');
const socketUtils = require('./utils/socket');

// Connect to Database
connectDB();

const server = http.createServer(app);

// Initialize Socket.io
socketUtils.init(server);

const PORT = process.env.PORT || 3004;

server.listen(PORT, () => {
    console.log(`[TenantRouter] Service (with Socket.io) started on port ${PORT}`);
});
