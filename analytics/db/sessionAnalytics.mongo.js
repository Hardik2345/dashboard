const { MongoClient } = require("mongodb");

let client = null;
let db = null;
let collection = null;
let connectPromise = null;
let indexesEnsured = false;

function getMongoUri() {
  return (process.env.SESSIONS_MONGO_URI || "").trim();
}

function getMongoDbName(uri) {
  const explicit = (process.env.SESSIONS_MONGO_DB || "").trim();
  if (explicit) return explicit;

  try {
    const parsed = new URL(uri);
    const path = (parsed.pathname || "").replace(/^\//, "").trim();
    return path || undefined;
  } catch {
    return undefined;
  }
}

async function ensureIndexes(targetCollection) {
  if (indexesEnsured) return;

  const existingIndexes = await targetCollection.indexes();
  const existingKeySignatures = new Set(
    existingIndexes.map((index) => JSON.stringify(index.key || {})),
  );

  const desiredIndexes = [
    { key: { sessionId: 1 }, options: { name: "sessionId_1", unique: true } },
    { key: { userId: 1 }, options: { name: "userId_1" } },
    { key: { email: 1 }, options: { name: "email_1" } },
    { key: { brand: 1 }, options: { name: "brand_1" } },
    { key: { startDate: 1 }, options: { name: "startDate_1" } },
    {
      key: { brand: 1, startDate: 1 },
      options: { name: "brand_1_startDate_1" },
    },
    {
      key: { userId: 1, startDate: 1 },
      options: { name: "userId_1_startDate_1" },
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

async function connectSessionAnalyticsMongo() {
  if (collection) return collection;
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    const mongoUri = getMongoUri();
    if (!mongoUri) {
      throw new Error("SESSIONS_MONGO_URI is required");
    }

    const nextClient = new MongoClient(mongoUri, {
      maxPoolSize: 10,
      minPoolSize: 1,
      retryReads: true,
      retryWrites: true,
    });

    await nextClient.connect();

    const dbName = getMongoDbName(mongoUri);
    const nextDb = dbName ? nextClient.db(dbName) : nextClient.db();
    const nextCollection = nextDb.collection("sessions");

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

function getSessionAnalyticsDb() {
  return db;
}

async function disconnectSessionAnalyticsMongo() {
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
  connectSessionAnalyticsMongo,
  disconnectSessionAnalyticsMongo,
  getSessionAnalyticsDb,
};
