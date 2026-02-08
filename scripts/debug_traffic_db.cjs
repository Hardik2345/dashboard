require('dotenv').config();
const { getBrands } = require('../config/brands');
const { getBrandConnection } = require('../lib/brandConnectionManager');
const { QueryTypes } = require('sequelize');

async function main() {
    const brands = getBrands();
    const brandKeys = Object.keys(brands);

    if (brandKeys.length === 0) {
        console.error('No brands found in config');
        return;
    }

    const brandKey = brandKeys[0]; // Just pick the first one
    const brandCfg = brands[brandKey];
    console.log(`Connecting to brand: ${brandKey}`);

    try {
        const conn = getBrandConnection(brandCfg);
        await conn.sequelize.authenticate();
        console.log('Connected successfully.');

        // 1. Check if table exists (via simple select)
        console.log('Querying overall_utm_summary limit 5...');
        try {
            const rows = await conn.sequelize.query('SELECT * FROM overall_utm_summary LIMIT 5', { type: QueryTypes.SELECT });
            console.log('Rows found:', rows.length);
            console.dir(rows, { depth: null });
        } catch (e) {
            console.error('Error querying table:', e.message);
        }

        // 2. Check aggregation
        console.log('Checking aggregation for last 30 days...');
        const END = new Date().toISOString().split('T')[0];
        const START_DATE = new Date();
        START_DATE.setDate(START_DATE.getDate() - 30);
        const START = START_DATE.toISOString().split('T')[0];
        console.log(`Date range: ${START} to ${END}`);

        const sql = `
          SELECT 
            utm_source, 
            SUM(utm_source_sessions) as sessions, 
            SUM(utm_source_atc_sessions) as atc_sessions
          FROM overall_utm_summary
          WHERE date >= ? AND date <= ?
          GROUP BY utm_source
    `;

        try {
            const aggRows = await conn.sequelize.query(sql, {
                type: QueryTypes.SELECT,
                replacements: [START, END]
            });
            console.log('Aggregated rows:', aggRows.length);
            console.dir(aggRows, { depth: null });
        } catch (e) {
            console.error('Error aggregating:', e.message);
        }

    } catch (err) {
        console.error('Global error:', err);
    } finally {
        process.exit(0);
    }
}

main();
