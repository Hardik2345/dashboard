const redisClient = require('../lib/redis');
const logger = require('../utils/logger');

async function inspect() {
    const key = 'hourly_metrics:tmc:2026-01-01'; // Yesterday

    try {
        const type = await redisClient.type(key);
        console.log(`Type: ${type}`);

        if (type === 'string') {
            const val = await redisClient.get(key);
            console.log('Raw Value:', val);
        } else {
            console.log('Not a string');
        }

    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

inspect();
