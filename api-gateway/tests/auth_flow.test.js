const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const crypto = require('crypto');

// SETUP KEYS BEFORE REQUIRING APP
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const KID = 'test-key-1';
const AUTH_KEYS = JSON.stringify([{
    kid: KID,
    privateKey,
    publicKey
}]);

process.env.AUTH_KEYS = AUTH_KEYS;
process.env.AUTH_ACTIVE_KID = KID;

const app = require('../src/app');
const DomainRule = require('../src/models/DomainRule.model');
const GlobalUser = require('../src/models/GlobalUser.model');
const RefreshToken = require('../src/models/RefreshToken.model');
const AuthService = require('../src/services/auth.service');
const TokenService = require('../src/services/token.service');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Increase timeout for mongo memory server download if needed
jest.setTimeout(30000);

let mongoServer;
const originalFetch = global.fetch;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
    global.fetch = originalFetch;
});

describe('Auth Flow', () => {
    let user;

    beforeEach(async () => {
        await GlobalUser.deleteMany({});
        await DomainRule.deleteMany({});
        await RefreshToken.deleteMany({});
        global.fetch = originalFetch;

        const passwordHash = await bcrypt.hash('password123', 10);
        user = await GlobalUser.create({
            email: 'test@example.com',
            password_hash: passwordHash,
            status: 'active',
            primary_brand_id: 'brand-123',
            brand_memberships: [{
                brand_id: 'brand-123',
                role: 'admin',
                status: 'active',
                permissions: ['all']
            }]
        });
    });

    test('Request permissions are valid for users and domain rules', async () => {
        const createdUser = await GlobalUser.create({
            email: 'requests@example.com',
            password_hash: 'hash',
            status: 'active',
            role: 'viewer',
            primary_brand_id: 'TMC',
            brand_memberships: [{
                brand_id: 'TMC',
                status: 'active',
                permissions: ['requests_panel', 'requests_timeline', 'multiselectable_kpi_cards']
            }]
        });

        const createdRule = await DomainRule.create({
            domain: 'requests.example.com',
            role: 'viewer',
            primary_brand_id: 'TMC',
            brand_ids: ['TMC'],
            permissions: ['requests_panel', 'requests_timeline', 'multiselectable_kpi_cards'],
            status: 'active'
        });

        expect(createdUser.brand_memberships[0].permissions).toEqual(['requests_panel', 'requests_timeline', 'multiselectable_kpi_cards']);
        expect(createdRule.permissions).toEqual(['requests_panel', 'requests_timeline', 'multiselectable_kpi_cards']);
    });

    test('Login Success', async () => {
        const res = await request(app)
            .post('/auth/login')
            .send({ email: 'test@example.com', password: 'password123' });

        expect(res.status).toBe(200);
        expect(res.body.access_token).toBeDefined();

        // VERIFY RS256
        const decodedVal = jwt.decode(res.body.access_token, { complete: true });
        expect(decodedVal.header.alg).toBe('RS256');
        expect(decodedVal.header.kid).toBe(KID);

        // Verify verification logic inside service
        // (Simulates verifying against public key)
        const verifyResult = TokenService.verifyAccessToken(res.body.access_token);
        expect(verifyResult.sub).toBe(user._id);
    });

    test('JWKS Endpoint', async () => {
        const res = await request(app)
            .get('/auth/.well-known/jwks.json');

        if (res.status !== 200) {
            throw new Error(`JWKS Error: ${res.status} ${JSON.stringify(res.body)}`);
        }

        expect(res.status).toBe(200);
        expect(res.body.keys).toBeDefined();
        expect(res.body.keys.length).toBeGreaterThan(0);
        const key = res.body.keys[0];
        expect(key.kty).toBe('RSA'); // HARDENING REQUIREMENT
        expect(key.use).toBe('sig');
        expect(key.alg).toBe('RS256');
        expect(key.kid).toBe(KID);
    });

    test('Refresh Success', async () => {
        const loginRes = await request(app)
            .post('/auth/login')
            .send({ email: 'test@example.com', password: 'password123' });
        const loginCookie = loginRes.headers['set-cookie'];

        const res = await request(app)
            .post('/auth/refresh')
            .set('Cookie', loginCookie);

        if (res.status !== 200) {
            throw new Error(`Refresh Error: ${res.status} ${JSON.stringify(res.body)}`);
        }

        expect(res.status).toBe(200);
        expect(res.body.access_token).toBeDefined();

        // Verify new token is also RS256
        const decodedVal = jwt.decode(res.body.access_token, { complete: true });
        expect(decodedVal.header.alg).toBe('RS256');
    });

    test('Reuse Detection & Chain Revocation', async () => {
        const loginRes = await request(app)
            .post('/auth/login')
            .send({ email: 'test@example.com', password: 'password123' });
        const originalCookie = loginRes.headers['set-cookie'];

        // Refresh once -> rotates
        await request(app)
            .post('/auth/refresh')
            .set('Cookie', originalCookie);

        // Reuse original -> should fail
        const res = await request(app)
            .post('/auth/refresh')
            .set('Cookie', originalCookie);

        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/revoked/i);

        // Verify all tokens revoked
        const tokens = await RefreshToken.find({ user_id: user._id });
        const activeTokens = tokens.filter(t => !t.revoked);
        expect(activeTokens.length).toBe(0);
    });

    test('Suspended User Login', async () => {
        user.status = 'suspended';
        await user.save();

        const res = await request(app)
            .post('/auth/login')
            .send({ email: 'test@example.com', password: 'password123' });

        expect(res.status).toBe(403);
    });

    test('Self Service Logout All (HTTP)', async () => {
        const loginRes = await request(app)
            .post('/auth/login')
            .send({ email: 'test@example.com', password: 'password123' });
        const accessToken = loginRes.body.access_token;

        let tokens = await RefreshToken.find({ user_id: user._id, revoked: false });
        expect(tokens.length).toBe(1);

        const res = await request(app)
            .post('/auth/logout-all-self')
            .set('Authorization', `Bearer ${accessToken}`);

        if (res.status !== 200) {
            throw new Error(`Logout Error: ${res.status} ${JSON.stringify(res.body)}`);
        }
        expect(res.status).toBe(200);

        tokens = await RefreshToken.find({ user_id: user._id, revoked: false });
        expect(tokens.length).toBe(0);
    });

    test('Forced Service Revocation (Non-HTTP)', async () => {
        await request(app)
            .post('/auth/login')
            .send({ email: 'test@example.com', password: 'password123' });

        let tokens = await RefreshToken.find({ user_id: user._id, revoked: false });
        expect(tokens.length).toBe(1);

        await AuthService.revokeAllRefreshTokensForUser(user._id);

        tokens = await RefreshToken.find({ user_id: user._id, revoked: false });
        expect(tokens.length).toBe(0);
    });

    test('Verify Access Token Error Normalization', () => {
        expect(() => {
            TokenService.verifyAccessToken('invalid.token.structure');
        }).toThrow('Invalid access token');
    });

    test('Admin upsert creates a brand_user with exactly one brand', async () => {
        const adminUser = await GlobalUser.create({
            email: 'admin@example.com',
            password_hash: await bcrypt.hash('password123', 10),
            status: 'active',
            role: 'author',
            primary_brand_id: 'TMC',
            brand_memberships: [{
                brand_id: 'TMC',
                status: 'active',
                permissions: ['all']
            }]
        });
        const accessToken = TokenService.generateAccessToken(adminUser);

        const res = await request(app)
            .post('/auth/admin/users')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
                email: 'brand-user@example.com',
                role: 'brand_user',
                brand_ids: ['BBB'],
                primary_brand_id: 'BBB',
                permissions: ['requests_panel'],
                status: 'active',
            });

        expect(res.status).toBe(200);
        expect(res.body.user.role).toBe('brand_user');
        expect(res.body.user.primary_brand_id).toBe('BBB');
        expect(res.body.user.brand_memberships).toHaveLength(1);
        expect(res.body.user.brand_memberships[0].brand_id).toBe('BBB');
        expect(res.body.user.brand_memberships[0].permissions).toEqual(['requests_panel']);
    });

    test('Admin upsert rejects brand_user with multiple brands', async () => {
        const adminUser = await GlobalUser.create({
            email: 'admin-2@example.com',
            password_hash: await bcrypt.hash('password123', 10),
            status: 'active',
            role: 'author',
            primary_brand_id: 'TMC',
            brand_memberships: [{
                brand_id: 'TMC',
                status: 'active',
                permissions: ['all']
            }]
        });
        const accessToken = TokenService.generateAccessToken(adminUser);

        const res = await request(app)
            .post('/auth/admin/users')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
                email: 'bad-brand-user@example.com',
                role: 'brand_user',
                brand_ids: ['BBB', 'TMC'],
                primary_brand_id: 'BBB',
                permissions: ['requests_panel'],
                status: 'active',
            });

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'brand_user requires exactly one brand' });
    });

    test('Admin upsert creates a super_admin with all brands and all permissions', async () => {
        const adminUser = await GlobalUser.create({
            email: 'admin-3@example.com',
            password_hash: await bcrypt.hash('password123', 10),
            status: 'active',
            role: 'author',
            primary_brand_id: 'TMC',
            brand_memberships: [{
                brand_id: 'TMC',
                status: 'active',
                permissions: ['all']
            }]
        });
        const accessToken = TokenService.generateAccessToken(adminUser);
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ 1: 'bbb', 2: 'tmc' }),
        });

        const res = await request(app)
            .post('/auth/admin/users')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
                email: 'super-admin@example.com',
                role: 'super_admin',
                brand_ids: ['IGNORED'],
                primary_brand_id: 'IGNORED',
                permissions: ['requests_panel'],
                status: 'active',
            });

        expect(res.status).toBe(200);
        expect(res.body.user.role).toBe('super_admin');
        expect(res.body.user.primary_brand_id).toBe('BBB');
        expect(res.body.user.brand_memberships.map((membership) => membership.brand_id)).toEqual(['BBB', 'TMC']);
        expect(res.body.user.brand_memberships.every((membership) => JSON.stringify(membership.permissions) === JSON.stringify(['all']))).toBe(true);
    });

    test('Provisioning from a super_admin domain rule assigns all brands', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ 1: 'bbb', 2: 'tmc' }),
        });

        await DomainRule.create({
            domain: 'super.example.com',
            role: 'super_admin',
            primary_brand_id: 'BBB',
            brand_ids: ['BBB', 'TMC'],
            permissions: ['all'],
            status: 'active'
        });

        const provisionedUser = await AuthService.provisionUserByDomainRule('owner@super.example.com');

        expect(provisionedUser.role).toBe('super_admin');
        expect(provisionedUser.primary_brand_id).toBe('BBB');
        expect(provisionedUser.brand_memberships.map((membership) => membership.brand_id)).toEqual(['BBB', 'TMC']);
        expect(provisionedUser.brand_memberships.every((membership) => JSON.stringify(membership.permissions) === JSON.stringify(['all']))).toBe(true);
    });

    test('Provisioning from an invalid brand_user domain rule is rejected', async () => {
        await DomainRule.create({
            domain: 'brand.example.com',
            role: 'brand_user',
            primary_brand_id: 'BBB',
            brand_ids: ['BBB', 'TMC'],
            permissions: ['requests_panel'],
            status: 'active'
        });

        await expect(
            AuthService.provisionUserByDomainRule('owner@brand.example.com')
        ).rejects.toThrow('brand_user requires exactly one brand');
    });
});
/* eslint-env jest */
