const Redis = require('ioredis');
const logger = require('./logger');

const client = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL)
  : new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
    });

client.on('error', (err) => logger.error('[Redis] connection error', err));
client.on('connect', () => logger.info('[Redis] Connected successfully'));

module.exports = client;
