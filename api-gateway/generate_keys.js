const crypto = require('crypto');

function generateKeys() {
    const kid = `key-${Date.now()}`;
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    // Create the JSON structure for AUTH_KEYS
    const authKeys = JSON.stringify([{
        kid,
        privateKey,
        publicKey
    }]); // No newlines in the stringified JSON to make it safe for .env

    console.log('\n--- COPY THESE INTO YOUR .env FILE ---\n');
    console.log(`AUTH_ACTIVE_KID=${kid}`);
    console.log(`AUTH_KEYS='${authKeys}'`);
    console.log('\n--------------------------------------\n');
}

generateKeys();
