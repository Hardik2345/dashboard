require('dotenv').config();

const { init } = require('./app');

init().catch((e) => {
  console.error('Startup failure', e);
  process.exit(1);
});
