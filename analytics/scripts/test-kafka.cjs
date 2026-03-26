const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { publishMessage, startConsumer, disconnect } = require('../lib/kafka');
const logger = require('../utils/logger');

async function testKafka() {
  logger.info('Starting Kafka test from host...');
  console.log('KAFKA_BROKERS:', process.env.KAFKA_BROKERS);

  // Start consumer in the background
  startConsumer(async ({ key, value, topic }) => {
    logger.info('Test Consumer received message:', { key, value, topic });
    console.log(`\n✅ PASS: Received message!`);
    console.log(`Topic: ${topic}`);
    console.log(`Key: ${key}`);
    console.log(`Value: ${value}`);
    
    // Disconnect after receiving the message
    setTimeout(async () => {
      await disconnect();
      process.exit(0);
    }, 2000);
  }).catch(err => {
    logger.error('Test Consumer error:', err);
    process.exit(1);
  });

  // Give it a second to connect
  console.log('Connecting to Kafka...');
  setTimeout(async () => {
    try {
      const testValue = JSON.stringify({ 
        message: 'Hello from Analytics Service!', 
        timestamp: new Date().toISOString(),
        sender: 'test-script'
      });
      console.log('Publishing message to brands-topic...');
      await publishMessage('brand-123', testValue);
      logger.info('Test message published');
    } catch (err) {
      logger.error('Test Producer error:', err);
      process.exit(1);
    }
  }, 5000);
}

testKafka();
