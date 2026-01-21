const mongoose = require('mongoose');

/**
 * Establishes a connection to MongoDB using the URI from environment variables.
 */
const connectDB = async () => {
    try {
        const connString = process.env.MONGODB_URI || 'mongodb://localhost:27017/tenant-router';

        await mongoose.connect(connString);

        console.log(`[Database] MongoDB Connected: ${mongoose.connection.host}`);
    } catch (error) {
        console.error(`[Database] MongoDB Connection Error: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;
