const { MongoClient } = require('mongodb');

let client = null;
let db = null;

async function connectMongo(uri) {
    if (client) return db;

    if (!uri) {
        console.warn('MONGO_URI not provided, skipping MongoDB connection.');
        return null;
    }

    try {
        client = new MongoClient(uri);
        await client.connect();

        // Use the database name from the connection string by default
        db = client.db();
        console.log(`Connected to MongoDB: ${db.databaseName}`);
        return db;
    } catch (err) {
        console.error('Failed to connect to MongoDB', err);
        throw err;
    }
}

function getMongoDb() {
    if (!db) {
        // Don't throw if not connected, just return null so optional logic can check
        return null;
    }
    return db;
}

async function closeMongo() {
    if (client) {
        await client.close();
        client = null;
        db = null;
    }
}

module.exports = { connectMongo, getMongoDb, closeMongo };
