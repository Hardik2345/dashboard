const { Kafka, logLevel } = require('kafkajs');

let kafka = null;
let producer = null;
let isProducerConnected = false;

function getKafka() {
  if (kafka) return kafka;

  const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
  const clientId = process.env.KAFKA_CLIENT_ID || 'tenant-router-service';
  
  console.log(`[Kafka] Initializing client: brokers=${brokers}, clientId=${clientId}`);

  kafka = new Kafka({
    clientId,
    brokers,
    logLevel: logLevel.INFO,
    retry: {
      initialRetryTime: 300,
      retries: 10,
    },
  });
  return kafka;
}

function getProducer() {
  if (producer) return producer;
  producer = getKafka().producer();
  return producer;
}

async function connectProducer(retries = 5, delay = 5000) {
  if (isProducerConnected) return;
  const p = getProducer();
  
  for (let i = 0; i < retries; i++) {
    try {
      await p.connect();
      isProducerConnected = true;
      console.log('[Kafka] Producer connected');
      return;
    } catch (error) {
      console.warn(`[Kafka] Producer connection attempt ${i + 1} failed: ${error.message}. Retrying in ${delay / 1000}s...`);
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('[Kafka] Producer failed to connect after maximum retries');
        throw error;
      }
    }
  }
}

async function publishMessage(topic, key, value) {
  try {
    await connectProducer();
    await getProducer().send({
      topic,
      messages: [
        { key: String(key), value: typeof value === 'string' ? value : JSON.stringify(value) },
      ],
    });
    console.log(`[Kafka] Message published to topic ${topic}, key ${key}`);
  } catch (error) {
    console.error(`[Kafka] Failed to publish message to topic ${topic}: ${error.message}`);
    throw error;
  }
}

module.exports = {
  publishMessage,
};
