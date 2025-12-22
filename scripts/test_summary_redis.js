import http from 'http';

const BRAND = 'PTS';
const DATE = '2025-12-19';

const url = `http://localhost:3000/metrics/summary?brand_key=${BRAND}&date=${DATE}`;

console.log(`Testing URL: ${url}`);

const start = Date.now();

const req = http.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    const duration = Date.now() - start;
    console.log(`\nStatus Code: ${res.statusCode}`);
    console.log(`Response Time: ${duration}ms`);
    
    try {
      const json = JSON.parse(data);
      console.log('Response Body Preview:', JSON.stringify(json, null, 2).slice(0, 500) + '...');
      if (json.sources) {
        console.log('\nData Sources:', json.sources);
      }
    } catch (e) {
      console.log('Response (not JSON):', data.slice(0, 200));
    }
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.end();
