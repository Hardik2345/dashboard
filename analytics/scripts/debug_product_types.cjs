
require('dotenv').config({ path: '../.env' });
const mysql = require('mysql2/promise');

async function main() {
    const brandKey = 'TMC';
    console.log(`Debug script starting for brand: ${brandKey}`);

    // From BRANDS_CONFIG in .env
    // Manually parsing the value seen in .env to ensure we have the credentials
    // BRANDS_CONFIG='[{"key":"PTS",...},{"key":"TMC","dbHost":"database-1.cd6gimoi6871.ap-south-1.rds.amazonaws.com","dbPort":3306,"dbUser":"admin","dbPass":"aJrw8QaxbMQxZVodpsjq","dbName":"TMC"}...]'

    const dbConfig = {
        host: 'database-1.cd6gimoi6871.ap-south-1.rds.amazonaws.com',
        user: 'admin',
        password: 'aJrw8QaxbMQxZVodpsjq',
        database: 'TMC',
        port: 3306
    };

    console.log('Connecting to DB...');
    let conn;
    try {
        conn = await mysql.createConnection(dbConfig);
        console.log('Connected.');
    } catch (err) {
        console.error('Failed to connect:', err);
        return;
    }

    try {
        // 1. Check if table exists
        const [tables] = await conn.query("SHOW TABLES LIKE 'product_landing_mapping'");
        if (tables.length === 0) {
            console.error("❌ Table 'product_landing_mapping' DOES NOT EXIST.");
        } else {
            console.log("✅ Table 'product_landing_mapping' exists.");

            // 2. Check row count
            const [countRows] = await conn.query("SELECT COUNT(*) as c FROM product_landing_mapping");
            console.log(`Total rows in product_landing_mapping: ${countRows[0].c}`);

            if (countRows[0].c > 0) {
                // 3. Check sample data
                const [sample] = await conn.query("SELECT * FROM product_landing_mapping LIMIT 5");
                console.log("Sample data:", sample);

                // 4. Check sync dates
                const [dates] = await conn.query("SELECT DISTINCT last_synced_at FROM product_landing_mapping ORDER BY last_synced_at DESC LIMIT 5");
                console.log("Recent last_synced_at values:", dates);

                // 5. Run the actual query from controller
                const date = new Date().toISOString().split('T')[0]; // Today
                console.log(`Running controller query with date: ${date}`);
                const sql = `
          SELECT DISTINCT product_type 
          FROM product_landing_mapping 
          WHERE DATE(last_synced_at) = (
            SELECT MAX(DATE(last_synced_at)) FROM product_landing_mapping WHERE DATE(last_synced_at) <= ?
          )
            AND product_type IS NOT NULL 
            AND product_type != ''
          ORDER BY product_type ASC
        `;
                const [types] = await conn.query(sql, [date]);
                console.log(`Controller query found ${types.length} types:`, types.map(t => t.product_type));
            } else {
                console.log("⚠️ Table is empty, nothing to query.");
            }
        }

    } catch (err) {
        console.error('Error during queries:', err);
    } finally {
        await conn.end();
    }
}

main();
