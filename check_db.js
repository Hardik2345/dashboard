const { Sequelize, DataTypes } = require('sequelize');
require('dotenv').config();

const DATABASE_NAME = process.env.DATABASE_NAME || 'dashboard';
const DATABASE_USER = process.env.DATABASE_USER || 'root';
const DATABASE_PASSWORD = process.env.DATABASE_PASSWORD || '';
const DATABASE_HOST = process.env.DATABASE_HOST || 'localhost';

const sequelize = new Sequelize(DATABASE_NAME, DATABASE_USER, DATABASE_PASSWORD, {
  host: DATABASE_HOST,
  dialect: 'mysql',
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  }
});

async function checkSchema() {
  try {
    const [results] = await sequelize.query("DESCRIBE alerts");
    console.log("ALERTS TABLE SCHEMA:");
    console.table(results);

    const [results2] = await sequelize.query("DESCRIBE alert_channels");
    console.log("\nALERT_CHANNELS TABLE SCHEMA:");
    console.table(results2);
  } catch (err) {
    console.error("Error checking schema:", err);
  } finally {
    await sequelize.close();
  }
}

checkSchema();
