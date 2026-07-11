const mongoose = require("mongoose");

let connectPromise = null;

async function connectMongo({ mongoUri, mongoDb }) {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!connectPromise) {
    connectPromise = mongoose
      .connect(mongoUri, { dbName: mongoDb })
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
