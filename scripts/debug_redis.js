require('dotenv').config();
const Redis = require('ioredis');

async function debug() {
    if (!process.env.REDIS_URL) {
        console.error('No REDIS_URL in .env');
        process.exit(1);
    }

    console.log('Using Redis URL:', process.env.REDIS_URL);
    const redis = new Redis(process.env.REDIS_URL);

    const key = 'hourly_metrics:tmc:2026-01-01';
    console.log(`Checking key: ${key}`);

    try {
        const type = await redis.type(key);
        console.log(`Type: ${type}`);

        if (type === 'string') {
            const val = await redis.get(key);
            console.log('Value (String):');
            console.log(val);
        } else if (type === 'hash') {
            const val = await redis.hgetall(key);
            console.log('Value (Hash):');
            console.log(val);
        } else {
            console.log('Other type');
        }

    } catch (e) {
        console.error(e);
    }
    redis.disconnect();
}

debug();
