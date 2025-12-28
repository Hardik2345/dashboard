#!/usr/bin/env node
// Usage: node scripts/create-admin-user.js --email pts@trytechit.co --password 'pts@techit' [--force]
// Creates (or updates) an admin user in the brand-specific database determined by the email prefix.
// Brand resolution: prefix before '@' uppercased -> BRAND_KEY. Ex: pts -> PTS, mila -> MILA.
// Required env vars per brand: <BRAND_KEY>_DB_HOST, _DB_USER, _DB_PASS, _DB_NAME (or defaults to key)
require('dotenv').config();
const { Sequelize, DataTypes } = require('sequelize');
const bcrypt = require('bcrypt');

async function main() {
  const args = process.argv.slice(2);
  let email = null; let password = null; let force = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email') email = args[++i];
    else if (args[i] === '--password') password = args[++i];
    else if (args[i] === '--force') force = true;
  }
  if (!email || !password) {
    console.error('Required: --email <email> --password <password>');
    process.exit(1);
  }

  const prefix = email.split('@')[0];
  const brandKey = (prefix || '').toUpperCase();
  if (!brandKey) {
    console.error('Unable to derive brand key from email');
    process.exit(1);
  }

  const host = process.env[`${brandKey}_DB_HOST`];
  const user = process.env[`${brandKey}_DB_USER`];
  const pass = process.env[`${brandKey}_DB_PASS`];
  const dbName = process.env[`${brandKey}_DB_NAME`] || brandKey;
  const port = Number(process.env[`${brandKey}_DB_PORT`] || 3306);

  if (!host || !user || !pass) {
    console.error(`Missing required env vars for brand ${brandKey}. Expected ${brandKey}_DB_HOST, ${brandKey}_DB_USER, ${brandKey}_DB_PASS`);
    process.exit(1);
  }

  console.log(`Using brand ${brandKey} DB ${dbName} @ ${host}:${port}`);

  const sequelize = new Sequelize(
    dbName,
    user,
    pass,
    {
      host,
      port,
      dialect: 'mysql',
      dialectModule: require('mysql2'),
      logging: false,
      timezone: '+00:00',
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      }
    }
  );

  const User = sequelize.define('user', {
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.STRING, allowNull: false, defaultValue: 'user' },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  }, { tableName: 'users', timestamps: true });

  try {
    await sequelize.authenticate();
    await User.sync(); // ensure table exists (no-op if existing)

    let user = await User.findOne({ where: { email } });
    const hash = await bcrypt.hash(password, 10);

    if (!user) {
  user = await User.create({ email, password_hash: hash, role: 'admin', is_active: true });
  console.log(`Created admin user ${email} in brand ${brandKey}`);
    } else {
      if (force) {
        await user.update({ password_hash: hash, role: 'admin', is_active: true });
  console.log(`Updated existing user as admin and reset password: ${email} (brand ${brandKey})`);
      } else {
        console.log('User already exists. Use --force to update password/role.');
      }
    }
  } catch (e) {
    console.error('Error creating admin user:', e.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
