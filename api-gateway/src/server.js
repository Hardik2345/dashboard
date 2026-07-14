const dotenv = require('dotenv');
dotenv.config();

const mongoose = require('mongoose');
const app = require('./app');
const { registerWithHealthMonitor } = require('./healthMonitor');
const logger = require('./utils/logger');
const { recordMongoConnectionError, captureError } = require('./observability');

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/auth_service_db';

mongoose.connect(MONGODB_URI)
    .then(() => {
        mongoose.connection.on('error', err => {
            recordMongoConnectionError();
            captureError(err, null, { type: 'mongo_connection' });
        });
        logger.info('Connected to MongoDB');
        app.listen(PORT, () => {
            logger.info(`Auth Service running on port ${PORT}`);
            registerWithHealthMonitor(app.buildHealthMonitorRegistrationPayload(), logger);
        });
    })
    .catch(err => {
        recordMongoConnectionError();
        captureError(err, null, { type: 'startup_mongo' });
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });
