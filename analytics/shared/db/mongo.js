const mongoose = require("mongoose");

let connectPromise = null;

function getMongoUri() {
  return process.env.MONGO_URI || process.env.RS_MONGO_URI || "";
}

async function connectMongo() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!connectPromise) {
    const mongoUri = getMongoUri();
    if (!mongoUri) {
      throw new Error("MONGO_URI or RS_MONGO_URI is required");
    }

    const options = {};
    if (process.env.MONGO_DB) {
      options.dbName = process.env.MONGO_DB;
    }

    connectPromise = mongoose
      .connect(mongoUri, options)
      .then(() => mongoose.connection)
      .catch((error) => {
        connectPromise = null;
        throw error;
      });
  }

  return connectPromise;
}

async function disconnectMongo() {
  if (mongoose.connection.readyState === 0) {
    connectPromise = null;
    return;
  }

  await mongoose.disconnect();
  connectPromise = null;
}

module.exports = {
  mongoose,
  connectMongo,
  disconnectMongo,
};
