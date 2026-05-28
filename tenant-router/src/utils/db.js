const mongoose = require('mongoose');
const { recordMongoConnectionError, captureError } = require('../observability');

/**
 * Establishes a connection to MongoDB using the URI from environment variables.
 */
const connectDB = async () => {
    try {
        const connString = process.env.MONGODB_URI || 'mongodb://localhost:27017/tenant-router';

        await mongoose.connect(connString);
        mongoose.connection.on('error', (error) => {
            recordMongoConnectionError();
            captureError(error, null, { type: 'mongo_connection' });
        });

        console.log(`[Database] MongoDB Connected: ${mongoose.connection.host}`);
    } catch (error) {
        recordMongoConnectionError();
        captureError(error, null, { type: 'startup_mongo' });
        console.error(`[Database] MongoDB Connection Error: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;
