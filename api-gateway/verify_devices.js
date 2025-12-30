const mongoose = require('mongoose');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const dotenv = require('dotenv');

dotenv.config();

// Ensure Keys exist (Mock if missing)
if (!process.env.AUTH_ACTIVE_KID) {
    const crypto = require('crypto');
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
    process.env.AUTH_ACTIVE_KID = 'test-key';
    process.env.AUTH_KEYS = JSON.stringify([{ kid: 'test-key', privateKey, publicKey }]);
}

const app = require('./src/app');
const GlobalUser = require('./src/models/GlobalUser.model');
const RefreshToken = require('./src/models/RefreshToken.model');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/auth_service_db';

async function runTest() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        // 1. Create User
        const email = 'multidevice@example.com';
        await GlobalUser.deleteMany({ email });

        const passwordHash = await bcrypt.hash('password123', 10);
        const brandId = 'brand-' + randomUUID();

        const user = await GlobalUser.create({
            email,
            password_hash: passwordHash,
            status: 'active',
            primary_brand_id: brandId,
            brand_memberships: [{
                brand_id: brandId,
                role: 'admin',
                status: 'active',
                permissions: ['all']
            }]
        });
        console.log('\nUser Created:', email);

        // 2. Login 4 Times with Different Device Metadata
        // We will send different User-Agent headers
        const devices = ['iPhone 13', 'MacBook Pro', 'Pixel 6', 'Windows Desktop'];
        const tokens = [];

        console.log('\nPerforming 4 Logins with Unique Devices...');

        for (const deviceName of devices) {
            const res = await request(app)
                .post('/auth/login')
                .send({ email, password: 'password123' })
                .set('User-Agent', deviceName); // Simulate specific device

            if (res.status !== 200) {
                console.error(`Login for ${deviceName} Failed:`, res.body);
                continue;
            }

            const cookies = res.headers['set-cookie'];
            const refreshTokenCookie = cookies.find(c => c.startsWith('refresh_token='));
            tokens.push(refreshTokenCookie);
            console.log(`Login Success: ${deviceName}`);
        }

        // 3. Verify DB Storage
        console.log('\nVerifying DB Storage...');
        const dbTokens = await RefreshToken.find({ user_id: user._id, revoked: false });

        console.log(`Updated Active Refresh Tokens in DB: ${dbTokens.length}`);

        // Extract device_ids (which map to User-Agent in our logic)
        const storedDevices = dbTokens.map(t => t.device_id).sort();
        const expectedDevices = [...devices].sort();

        console.log('Stored Devices:', storedDevices);

        const allMatch = JSON.stringify(storedDevices) === JSON.stringify(expectedDevices);

        if (allMatch && dbTokens.length === 4) {
            console.log('✅ SUCCESS: All devices are distinctly recorded.');
            console.log('✅ SUCCESS: Multiple sessions active simultaneously.');
        } else {
            console.log(`❌ FAILURE: Device metadata mismatch.`);
        }

    } catch (err) {
        console.error('Test Failed:', err);
    } finally {
        await mongoose.disconnect();
    }
}

runTest();
