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
 * @param {string|number} from - Unix timestamp for start date.
 * @param {string|number} to - Unix timestamp for end date.
 * @returns {Promise<{ success: boolean, count: number }>}
 */
async function getLandingPageSessions(from, to) {
  try {
    // Convert Unix timestamp (seconds) to YYYY-MM-DD
    const fromDate = from;
    const toDate = to;

    logger.info(`Fetching landing page sessions for AJMAL: ${fromDate} to ${toDate}`);


    const db = await getBrandConnection('AJMAL');
    
    const rows = await db.sequelize.query(
      `SELECT SUM(sessions) as total_sessions, SUM(sessions_with_cart_additions) as total_cart_additions 
       FROM mv_product_sessions_by_path_daily 
       WHERE date >= ? AND date <= ? AND landing_page_path = ?`,
      {
        replacements: [fromDate, toDate, '/pages/ajmalxranvir/'],
        type: QueryTypes.SELECT
      }
    );

    // SELECT SUM returns rows array with one object usually
    const result = Array.isArray(rows) && rows[0] ? rows[0] : rows;
    const total = result?.total_sessions ? Number(result.total_sessions) : 0;
    const atc = result?.total_cart_additions ? Number(result.total_cart_additions) : 0;

    return { success: true, count: total, atcCount: atc };

  } catch (error) {
    logger.error('Error fetching landing page sessions from AJMAL DB:', error.message);
    throw error;
  }
}

/**
 * Fetches unique cart tokens count from MongoDB sessions collection.
 * @param {string} from - YYYY-MM-DD
 * @param {string} to - YYYY-MM-DD
 * @param {string} eventType - The event_type to match
 * @returns {Promise<{ success: boolean, count: number }>}
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
          createdAt: { $gte: startDate, $lte: endDate },
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
 * @param {string} from - YYYY-MM-DD
 * @param {string} to - YYYY-MM-DD
 * @param {string} collectionName
 * @returns {Promise<{ success: boolean, count: number }>}
 */
async function getMongoCollectionCount(from, to, collectionName) {
  try {
    const startDate = toUtcDateFromIstDay(from);
    const endDate = toUtcDateFromIstDay(to, true);

    const client = await getMongoClient();
    const db = client.db('alerts'); 
    const collection = db.collection(collectionName);

    const count = await collection.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate }
    });

    return { success: true, count };
  } catch (error) {
    logger.error(`Error counting Mongo collection ${collectionName}:`, error.message);
    throw error;
  }
}

module.exports = {
  getQrScans,
  getLandingPageSessions,
  getMongoEventCount,
  getMongoCollectionCount
};

