const { MongoClient } = require("mongodb");

let client = null;
let db = null;
let collection = null;
let connectPromise = null;
let indexesEnsured = false;

function getMongoUri() {
  return (process.env.SPEED_MONGO_URI || "").trim();
}

function getMongoDbName() {
  return (process.env.SPEED_MONGO_DB || "").trim();
}

async function ensureIndexes(targetCollection) {
  if (indexesEnsured) return;

  const existingIndexes = await targetCollection.indexes();
  const existingKeySignatures = new Set(
    existingIndexes.map((index) => JSON.stringify(index.key || {})),
  );

  const desiredIndexes = [
    {
      key: { brand_key: 1, date: 1 },
      options: { name: "brand_key_1_date_1" },
    },
    {
      key: { brand_key: 1, date: 1, time: 1 },
      options: { name: "brand_key_1_date_1_time_1" },
    },
  ];

  for (const index of desiredIndexes) {
    const signature = JSON.stringify(index.key);
    if (existingKeySignatures.has(signature)) {
      continue;
    }
    await targetCollection.createIndex(index.key, index.options);
  }

  indexesEnsured = true;
}

async function connectWebVitalsMongo() {
  if (collection) return collection;
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    const mongoUri = getMongoUri();
    if (!mongoUri) {
      throw new Error("SPEED_MONGO_URI is required");
    }
    const dbName = getMongoDbName();
    if (!dbName) {
      throw new Error("SPEED_MONGO_DB is required");
    }

    const nextClient = new MongoClient(mongoUri, {
      maxPoolSize: 10,
      minPoolSize: 1,
      retryReads: true,
      retryWrites: true,
    });

    await nextClient.connect();

    const nextDb = nextClient.db(dbName);
    const nextCollection = nextDb.collection("test_results");

    client = nextClient;
    db = nextDb;
    collection = nextCollection;

    client.on("close", () => {
      client = null;
      db = null;
      collection = null;
      connectPromise = null;
      indexesEnsured = false;
    });

    await ensureIndexes(nextCollection);
    return nextCollection;
  })().catch((error) => {
    client = null;
    db = null;
    collection = null;
    connectPromise = null;
    indexesEnsured = false;
    throw error;
  });

  return connectPromise;
}

function getWebVitalsDb() {
  return db;
}

async function disconnectWebVitalsMongo() {
  if (!client) {
    connectPromise = null;
    collection = null;
    db = null;
    indexesEnsured = false;
    return;
  }

  await client.close();
  client = null;
  db = null;
  collection = null;
  connectPromise = null;
  indexesEnsured = false;
}

module.exports = {
  connectWebVitalsMongo,
  disconnectWebVitalsMongo,
  getWebVitalsDb,
};
