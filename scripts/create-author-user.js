#!/usr/bin/env node
// Usage: node scripts/create-author-user.js --email author@master --password 'StrongPass123!' [--force]
// Creates (or updates) an author user in the base (platform) database defined by DB_HOST / DB_NAME / DB_USER / DB_PASS.
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

  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const pass = process.env.DB_PASS;
  const dbName = process.env.DB_NAME;
  const port = Number(process.env.DB_PORT || 3306);

  if (!host || !user || !pass || !dbName) {
    console.error('Missing DB_* env vars (DB_HOST, DB_USER, DB_PASS, DB_NAME) for base database.');
    process.exit(1);
  }

  console.log(`Connecting to base DB ${dbName} @ ${host}:${port}`);

  const sequelize = new Sequelize(dbName, user, pass, {
    host,
    port,
    dialect: 'mysql',
    dialectModule: require('mysql2'),
    logging: false,
    timezone: '+00:00'
  });

  const User = sequelize.define('user', {
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.STRING, allowNull: false, defaultValue: 'user' },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  }, { tableName: 'users', timestamps: true });

  try {
    await sequelize.authenticate();
    await User.sync();
    let userRec = await User.findOne({ where: { email } });
    const hash = await bcrypt.hash(password, 12);
    if (!userRec) {
      userRec = await User.create({ email, password_hash: hash, role: 'author', is_active: true });
      console.log(`Created author user ${email}`);
    } else if (force) {
      await userRec.update({ password_hash: hash, role: 'author', is_active: true });
      console.log(`Updated existing user to author & reset password: ${email}`);
    } else {
      console.log('User already exists. Use --force to update password/role.');
    }
  } catch (e) {
    console.error('Error creating author user:', e.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();