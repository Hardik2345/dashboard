const mongoose = require("mongoose");
const { env } = require("./env");
const logger = require("../utils/logger");

async function connectMongo() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB });
  logger.info(`[reporting-service] connected to mongo db=${env.MONGO_DB}`);
}

module.exports = { connectMongo };
