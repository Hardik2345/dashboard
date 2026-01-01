/* eslint-env jest */
const crypto = require('crypto');

// MOCK KEYS BEFORE REQUIRE APP
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const KID = 'test-key-load';
process.env.AUTH_KEYS = JSON.stringify([{
    kid: KID,
    privateKey,
    publicKey
}]);
process.env.AUTH_ACTIVE_KID = KID;

const app = require('../src/app');

test('App loads without crashing', () => {
    expect(app).toBeDefined();
});
