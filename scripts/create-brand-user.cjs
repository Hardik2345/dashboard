#!/usr/bin/env node
/**
 * Usage: node scripts/create-brand-user.js --brand <BRAND_KEY> --email <email> --password <password> [--force]
 *
 * Example:
 *   node scripts/create-brand-user.js --brand PTS --email employee@skincarepersonaltouch.com --password 'Welcome123!'
 *
 * This script creates a user with role='user' (non-admin) in the specified brand's database.
 * The user will:
 *  - Only be able to access this specific brand.
 *  - NOT see Web Vitals.
 *  - NOT see Filters (product/UTM).
 *  - See the Homepage (KPIs, Charts).
 *
 * NOTE: The email domain MUST match the brand's configured domain OR the email local part must match the brand key
 *       for the login system to route them to the correct brand.
 */

require('dotenv').config();
const { Sequelize, DataTypes } = require('sequelize');
const bcrypt = require('bcrypt');
const { getBrands } = require('../config/brands');

async function main() {
    const args = process.argv.slice(2);
    let email = null;
    let password = null;
    let brandKey = null;
    let force = false;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--email') email = args[++i];
        else if (args[i] === '--password') password = args[++i];
        else if (args[i] === '--brand') brandKey = args[++i];
        else if (args[i] === '--force') force = true;
    }

    if (!email || !password || !brandKey) {
        console.error('Usage: node scripts/create-brand-user.js --brand <BRAND_KEY> --email <email> --password <password> [--force]');
        process.exit(1);
    }

    const normalizedKey = brandKey.toUpperCase();
    const brands = getBrands();
    const brandCfg = brands[normalizedKey];

    if (!brandCfg) {
        console.error(`Brand "${normalizedKey}" not found in configuration.`);
        console.error('Available brands:', Object.keys(brands).join(', '));
        process.exit(1);
    }

    console.log(`Using brand configuration for ${normalizedKey}:`, {
        host: brandCfg.dbHost,
        db: brandCfg.dbName,
        user: brandCfg.dbUser
    });

    const sequelize = new Sequelize(
        brandCfg.dbName,
        brandCfg.dbUser,
        brandCfg.dbPass,
        {
            host: brandCfg.dbHost,
            port: brandCfg.dbPort,
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
        console.log('Database connection successful.');
        await User.sync(); // ensure table exists

        let user = await User.findOne({ where: { email } });
        const hash = await bcrypt.hash(password, 10);

        if (!user) {
            user = await User.create({
                email,
                password_hash: hash,
                role: 'user', // Non-admin role
                is_active: true
            });
            console.log(`✅ Created non-admin user ${email} for brand ${normalizedKey}`);
        } else {
            if (force) {
                await user.update({
                    password_hash: hash,
                    role: 'user', // Enforce non-admin role
                    is_active: true
                });
                console.log(`✅ Updated existing user to non-admin and reset password: ${email}`);
            } else {
                console.log('⚠️  User already exists.');
                console.log('   Current role:', user.role);
                console.log('   Use --force to overwrite password and ensure non-admin role.');
            }
        }

    } catch (e) {
        console.error('❌ Error:', e.message);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

main();
