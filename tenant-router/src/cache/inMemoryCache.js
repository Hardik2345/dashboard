const { LRUCache } = require('lru-cache');

const options = {
    max: 500,
    ttl: 1000 * 600,
    allowStale: false, // Default: return undefined if expired
    updateAgeOnGet: false,
    updateAgeOnHas: false,
};

const cache = new LRUCache(options);

module.exports = {
    get: (key) => cache.get(key),
    /**
     * Returns value even if expired.
     */
    getStale: (key) => cache.get(key, { allowStale: true }),
    set: (key, value) => cache.set(key, value),
    has: (key) => cache.has(key),
    delete: (key) => cache.delete(key),
    clear: () => cache.clear()
};
