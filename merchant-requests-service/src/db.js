const mongoose = require("mongoose");

async function connectDB(config) {
  mongoose.set("strictQuery", true);
  await mongoose.connect(config.mongoUri, {
    dbName: config.mongoDb,
  });
  console.log(`[merchant-requests] MongoDB connected: ${mongoose.connection.host}`);
  return mongoose.connection;
}

module.exports = { connectDB };
