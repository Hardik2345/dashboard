const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const app = require('./app');
const connectDB = require('./utils/db');
const socketUtils = require('./utils/socket');
const { registerWithHealthMonitor } = require('./healthMonitorRegistration');

// Connect to Database
connectDB();

const server = http.createServer(app);

// Initialize Socket.io
socketUtils.init(server);

const PORT = process.env.PORT || 3004;

server.listen(PORT, () => {
    console.log(`[TenantRouter] Service (with Socket.io) started on port ${PORT}`);
    registerWithHealthMonitor({
        serviceName: 'tenant-router',
        baseUrl: 'http://tenant-router:3004',
        healthEndpoint: '/health',
        endpoints: [
            {
                path: '/health',
                method: 'GET',
                critical: true,
                intervalSeconds: 30,
                expectedStatus: 200,
            },
            {
                path: '/health/monitor',
                method: 'GET',
                critical: true,
                intervalSeconds: 60,
                expectedStatus: 200,
            },
        ],
        dependencies: ['mongo'],
    }).catch(() => {});
});
