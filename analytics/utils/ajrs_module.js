const axios = require('axios');
const logger = require('./logger'); 
const { getBrandConnection } = require('../lib/brandConnectionManager');
const { QueryTypes } = require('sequelize');
const { MongoClient } = require('mongodb');

let mongoClient = null;
const IST_OFFSET_MINUTES = 330;

async function getMongoClient() {
  const uri = process.env.RS_MONGO_URI;
  if (!uri) throw new Error('RS_MONGO_URI is missing from environment');
  if (!mongoClient) {
    mongoClient = new MongoClient(uri);
    await mongoClient.connect();
  }
  return mongoClient;
}

function toUtcDateFromIstDay(dateStr, isEnd = false) {
  const [year, month, day] = String(dateStr)
    .split('-')
    .map((value) => Number(value));

  if (!year || !month || !day) {
    throw new Error(`Invalid date: ${dateStr}`);
  }

  const utcMillis =
    Date.UTC(
      year,
      month - 1,
      day,
      isEnd ? 23 : 0,
      isEnd ? 59 : 0,
      isEnd ? 59 : 0,
      isEnd ? 999 : 0,
    ) - IST_OFFSET_MINUTES * 60 * 1000;

  return new Date(utcMillis);
}



/**
 * Saves QR scan data to MongoDB.
 * @param {Array} scans - Array of QR scan objects.
 */
async function saveQrScans(scans) {
  if (!Array.isArray(scans) || scans.length === 0) return;

  try {
    const client = await getMongoClient();
    const db = client.db('alerts'); 
    const collection = db.collection('qr_scans');

    // Prepare bulk operations for upserting
    const operations = scans.map((scan) => {
      // Use scanUrl and date as unique identifiers
      return {
        updateOne: {
          filter: { scanUrl: scan.scanUrl, date: scan.date },
          update: { $set: { ...scan, stored_at: new Date() } },
          upsert: true
        }
      };
    });

    if (operations.length > 0) {
      const result = await collection.bulkWrite(operations);
      logger.info(`[saveQrScans] Bulk write completed: ${result.upsertedCount} upserted, ${result.modifiedCount} modified.`);
    }
  } catch (error) {
    logger.error('Error saving QR scans to MongoDB:', error.message);
    // Don't throw, we don't want to break the fetch if storage fails
  }
}

/**
 * Fetches QR scan data from qrfy.com API.
 * @param {string|number} from - Unix timestamp for start date.
 * @param {string|number} to - Unix timestamp for end date.
 * @returns {Promise<{ count: number, data: Array }>}
 */
async function getQrScans(from, to) {
  const apiKey = process.env.RS_QR_API;
  console.log("API key is here!!🚨", apiKey)
  
  if (!apiKey) {
    logger.warn('RS_QR_API is not set in environment variables');
    throw new Error('API key is missing');
  }

  try {
    const response = await axios.get('https://qrfy.com/api/public/qrs/report', {
      headers: {
        'API-KEY': apiKey
      },
      params: {
        from: from,
        to: to,
        format: 'json'
      }
    });

    if (response.status === 200 && Array.isArray(response.data)) {
      // --- Save to MongoDB as a side effect ---
      // We don't await this to avoid blocking the API response
      saveQrScans(response.data).catch(err => {
        logger.error('[getQrScans] Background save failed:', err.message);
      });

      return {
        count: response.data.length,
        data: response.data
      };
    } else {
      logger.error('Unexpected response from qrfy API:', response.status, response.data);
      throw new Error('Invalid response from QR API');
    }
  } catch (error) {
    logger.error('Error fetching QR scans from qrfy:', error.message);
    if (error.response) {
      logger.error('API Response Error:', error.response.status, error.response.data);
    }
    throw error;
  }
}

/**
 * Fetches landing page sessions from AJMAL database.
 */
async function getLandingPageSessions(from, to) {
  try {
    const fromDate = from;
    const toDate = to;

    logger.info(`[getLandingPageSessions] Fetching sessions for AJMAL: ${fromDate} to ${toDate}`);

    const db = await getBrandConnection('AJMAL');
    
    // We only fetch total_sessions here. ATC is now handled via MongoDB.
    const rows = await db.sequelize.query(
      `SELECT SUM(sessions) as total_sessions 
       FROM mv_product_sessions_by_path_daily 
       WHERE date >= ? AND date <= ? AND landing_page_path = ?`,
      {
        replacements: [fromDate, toDate, '/pages/ajmalxranvir/'],
        type: QueryTypes.SELECT
      }
    );

    const result = Array.isArray(rows) && rows[0] ? rows[0] : rows;
    const total = result?.total_sessions ? Number(result.total_sessions) : 0;

    return { success: true, count: total };

  } catch (error) {
    logger.error('Error fetching landing page sessions from AJMAL DB:', error.message);
    throw error;
  }
}

/**
 * Fetches unique cart tokens count from MongoDB sessions collection.
 * Supports multiple timestamp fields (createdAt, stored_at) to avoid missing documents.
 */
async function getMongoEventCount(from, to, eventType) {
  try {
    const startDate = toUtcDateFromIstDay(from);
    const endDate = toUtcDateFromIstDay(to, true);

    const client = await getMongoClient();
    const db = client.db('alerts'); 
    const collection = db.collection('sessions');

    const pipeline = [
      {
        $match: {
          $or: [
            { createdAt: { $gte: startDate, $lte: endDate } },
            { stored_at: { $gte: startDate, $lte: endDate } }
          ],
          event_type: { $in: [eventType] }
        }
      },
      {
        $group: {
          _id: "$event_type",
          unique_cart_tokens: { $addToSet: "$cart_token" }
        }
      },
      {
        $project: {
          _id: 0,
          event_type: "$_id",
          count: { $size: "$unique_cart_tokens" }
        }
      }
    ];

    const results = await collection.aggregate(pipeline).toArray();
    const count = results?.[0]?.count || 0;
    return { success: true, count };
  } catch (error) {
    logger.error(`Error fetching Mongo event ${eventType}:`, error.message);
    throw error;
  }
}

/**
 * Fetches document count from a specific MongoDB collection over dates.
 * Supports multiple timestamp fields (createdAt, stored_at) to avoid missing documents.
 */
async function getMongoCollectionCount(from, to, collectionName) {
  try {
    const startDate = toUtcDateFromIstDay(from);
    const endDate = toUtcDateFromIstDay(to, true);

    const client = await getMongoClient();
    const db = client.db('alerts'); 
    const collection = db.collection(collectionName);

    // Filter to handle multiple possible timestamp fields
    const query = {
      $or: [
        { createdAt: { $gte: startDate, $lte: endDate } },
        { stored_at: { $gte: startDate, $lte: endDate } },
        // Fallback for some legacy imports
        { timestamp: { $gte: startDate, $lte: endDate } }
      ]
    };

    const count = await collection.countDocuments(query);

    return { success: true, count };
  } catch (error) {
    logger.error(`Error counting Mongo collection ${collectionName}:`, error.message);
    throw error;
  }
}

module.exports = {
  getQrScans,
  saveQrScans,
  getLandingPageSessions,
  getMongoEventCount,
  getMongoCollectionCount
};



