const redisClient = require('../lib/redis');
const logger = require('../utils/logger');

async function inspect() {
    const key = 'hourly_metrics:tmc:2026-01-01';

    try {
        const type = await redisClient.type(key);
        console.log(`Type of ${key}:`, type);

        if (type === 'string') {
            const val = await redisClient.get(key);
            console.log('Value:', val);
        } else if (type === 'hash') {
            const val = await redisClient.hgetall(key);
            console.log('Value:', val);
        } else {
            console.log('Other type');
        }

    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

inspect();
