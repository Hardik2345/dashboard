const mongoose = require('mongoose');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const dotenv = require('dotenv');

dotenv.config();

// Mock Keys if needed
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
        const email = 'revocation_test@example.com';
        await GlobalUser.deleteMany({ email });

        const passwordHash = await bcrypt.hash('password123', 10);
        const brandId = 'brand-' + randomUUID();

        await GlobalUser.create({
            email,
            password_hash: passwordHash,
            status: 'active',
            primary_brand_id: brandId,
            brand_memberships: [{ brand_id: brandId, role: 'admin', status: 'active', permissions: ['all'] }]
        });
        console.log('\nUser Created:', email);

        // 2. Login
        const loginRes = await request(app)
            .post('/auth/login')
            .send({ email, password: 'password123' });

        if (loginRes.status !== 200) throw new Error('Login failed');

        // Extract Refresh Cookie
        const cookies = loginRes.headers['set-cookie'];
        const refreshTokenCookie = cookies.find(c => c.startsWith('refresh_token='));
        console.log('Login Successful. Got Refresh Token.');

        // 3. Logout (Revocation)
        const logoutRes = await request(app)
            .post('/auth/logout')
            .set('Cookie', [refreshTokenCookie]); // Send the cookie

        if (logoutRes.status === 200) {
            console.log('Logout Successful. Token should be revoked.');
        } else {
            console.error('Logout failed:', logoutRes.body);
            return;
        }

        // 4. Verification: Try to Refresh using the SAME Revoked Cookie
        console.log('\nAttempting to Refresh using Revoked Token...');
        const refreshRes = await request(app)
            .post('/auth/refresh')
            .set('Cookie', [refreshTokenCookie]);

        console.log('Refresh Response Status:', refreshRes.status);
        console.log('Refresh Response Body:', refreshRes.body);

        if (refreshRes.status === 401 && refreshRes.body.error === 'Token revoked') {
            console.log('✅ SUCCESS: Revoked token was rejected with 401 Unauthorized.');
        } else {
            console.log('❌ FAILURE: Revoked token was NOT rejected correctly.');
        }

    } catch (err) {
        console.error('Test Failed:', err);
    } finally {
        await mongoose.disconnect();
    }
}

runTest();
