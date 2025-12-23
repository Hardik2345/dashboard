const axios = require('axios');

async function testCache() {
  const brand = 'TMC';
  const date = '2025-12-17';
  const url = `https://etl-cache-pipeline.onrender.com/api/metrics?brand=${brand.toLowerCase()}&date=${date}`;

  console.log(`Fetching from ${url}...`);
  try {
    const res = await axios.get(url);
    console.log('Status:', res.status);
    console.log('Data:', JSON.stringify(res.data, null, 2));
  } catch (err) {
    if (err.response) {
       console.log('Error Status:', err.response.status);
       console.log('Error Data:', err.response.data);
    } else {
       console.error('Error:', err.message);
    }
  }
}

testCache();
