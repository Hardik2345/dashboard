const http = require('http');

const payload = JSON.stringify({
    type: 'test',
    data: 'hello from verification script'
});

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/webhooks/qstash',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload.length
    }
};

function tryRequest(retries) {
    const req = http.request(options, (res) => {
        console.log(`STATUS: ${res.statusCode}`);
        if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log("SUCCESS");
        }
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
            console.log(`BODY: ${chunk}`);
        });
    });

    req.on('error', (e) => {
        console.error(`problem with request: ${e.message}`);
        if (retries > 0) {
            console.log(`Retrying in 2 seconds... (${retries} left)`);
            setTimeout(() => tryRequest(retries - 1), 2000);
        }
    });

    req.write(payload);
    req.end();
}

tryRequest(5);
