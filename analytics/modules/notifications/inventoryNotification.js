const { MongoClient } = require('mongodb');

let mongoClient = null;

async function getMongoClient() {
  const uri = process.env.MONGO_URI || process.env.RS_MONGO_URI; // Use your primary mongo URI
  if (!uri) throw new Error('Mongo URI is missing from environment');
  
  if (!mongoClient) {
    mongoClient = new MongoClient(uri);
    await mongoClient.connect();
  }
  return mongoClient;
}

// Returning a helper that can insert documents since mongoose is not installed here
async function saveInventoryNotification(doc) {
  const client = await getMongoClient();
  const db = client.db(); // Uses default DB from URI, or pass your specific db name like db('dashboard')
  const collection = db.collection('inventory_notifications');
  
  doc.createdAt = new Date();
  doc.updatedAt = new Date();
  doc.is_read = false;

  const result = await collection.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

module.exports = { saveInventoryNotification };
