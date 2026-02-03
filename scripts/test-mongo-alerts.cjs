const { connectMongo, closeMongo } = require('../lib/mongo');
const { ObjectId } = require('mongodb');
const process = require('process');

// Usage: node scripts/test-mongo-alerts.cjs <MONGO_URI>
async function run() {
    const uri = process.argv[2] || process.env.MONGO_URI;
    if (!uri) {
        console.error('Usage: node scripts/test-mongo-alerts.cjs <MONGO_URI>');
        process.exit(1);
    }

    const db = await connectMongo(uri);
    const collection = db.collection('alerts');
    console.log('Connected to MongoDB. Alerts collection:', collection.collectionName);

    // 1. Create Alert
    console.log('\n--- Test 1: Create Alert ---');
    const newAlert = {
        brand_id: 999,
        name: 'Test Mongo Alert',
        metric_name: 'total_orders',
        metric_type: 'base',
        threshold_type: 'percentage_drop',
        threshold_value: 20,
        severity: 'medium',
        is_active: true,
        created_at: new Date()
    };
    const insertRes = await collection.insertOne(newAlert);
    const newId = insertRes.insertedId;
    console.log('Inserted Alert ID:', newId);

    if (!newId) throw new Error('Insert failed');

    // 2. Read Alert
    console.log('\n--- Test 2: Read Alert ---');
    const fetched = await collection.findOne({ _id: newId });
    console.log('Fetched Alert:', fetched);
    if (!fetched || fetched.name !== 'Test Mongo Alert') throw new Error('Read failed or data mismatch');

    // 3. Update Alert
    console.log('\n--- Test 3: Update Alert ---');
    await collection.updateOne({ _id: newId }, { $set: { threshold_value: 25, is_active: false } });
    const updated = await collection.findOne({ _id: newId });
    console.log('Updated Alert:', updated);
    if (updated.threshold_value !== 25 || updated.is_active !== false) throw new Error('Update failed');

    // 4. Delete Alert
    console.log('\n--- Test 4: Delete Alert ---');
    await collection.deleteOne({ _id: newId });
    const deleted = await collection.findOne({ _id: newId });
    if (deleted) throw new Error('Delete failed, document still exists');
    console.log('Alert deleted successfully');

    console.log('\n✅ All Mongo Alert tests passed');
    await closeMongo();
}

run().catch(err => {
    console.error('Test Failed:', err);
    process.exit(1);
});
