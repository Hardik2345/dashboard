const { Kafka, logLevel } = require('kafkajs');
const logger = require('../utils/logger');

let kafka = null;
let producer = null;
let consumer = null;

let isProducerConnected = false;
let isConsumerConnected = false;

function getKafka() {
  if (kafka) return kafka;

  const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
  const clientId = process.env.KAFKA_CLIENT_ID || 'analytics-service';
  
  logger.info(`Initializing Kafka client`, { brokers, clientId });
  console.log(`[KAFKA_DEBUG] Brokers: ${brokers}, ClientID: ${clientId}`);

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

function getConsumer() {
  if (consumer) return consumer;
  const groupId = process.env.KAFKA_GROUP_ID || 'analytics-group';
  consumer = getKafka().consumer({ groupId });
  return consumer;
}

async function connectProducer(retries = 5, delay = 5000) {
  if (isProducerConnected) return;
  const p = getProducer();
  
  for (let i = 0; i < retries; i++) {
    try {
      await p.connect();
      isProducerConnected = true;
      logger.info('Kafka Producer connected');
      return;
    } catch (error) {
      logger.warn(`Kafka Producer connection attempt ${i + 1} failed. Retrying in ${delay / 1000}s...`, { error: error.message });
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        logger.error('Kafka Producer failed to connect after maximum retries');
        throw error;
      }
    }
  }
}

async function connectConsumer(retries = 10, delay = 5000) {
  if (isConsumerConnected) return;
  const c = getConsumer();
  
  for (let i = 0; i < retries; i++) {
    try {
      await c.connect();
      isConsumerConnected = true;
      logger.info('Kafka Consumer connected');
      return;
    } catch (error) {
      logger.warn(`Kafka Consumer connection attempt ${i + 1} failed. Broker might be starting up. Retrying in ${delay / 1000}s...`, { error: error.message });
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        logger.error('Kafka Consumer failed to connect after maximum retries');
        throw error;
      }
    }
  }
}

async function publishMessage(key, value) {
  const topic = process.env.KAFKA_TOPIC || 'brands-topic';
  try {
    await connectProducer();
    await getProducer().send({
      topic,
      messages: [
        { key: String(key), value: typeof value === 'string' ? value : JSON.stringify(value) },
      ],
    });
    logger.info(`Message published to topic ${topic}`, { key });
  } catch (error) {
    logger.error(`Failed to publish message to topic ${topic}`, { error: error.message });
    throw error;
  }
}

async function startConsumer(messageHandler) {
  const topic = process.env.KAFKA_TOPIC || 'brands-topic';
  try {
    await connectConsumer();
    const c = getConsumer();
    await c.subscribe({ topic, fromBeginning: false });
    await c.run({
      eachMessage: async ({ topic, partition, message }) => {
        const key = message.key ? message.key.toString() : null;
        const value = message.value ? message.value.toString() : null;
        logger.info(`Received message from ${topic}`, { key, partition });
        
        if (messageHandler) {
          try {
            await messageHandler({ key, value, partition, topic });
          } catch (handlerError) {
            logger.error('Error in Kafka message handler', { error: handlerError.message });
          }
        }
      },
    });
    logger.info(`Kafka Consumer running on topic ${topic}`);
  } catch (error) {
    logger.error(`Failed to start Kafka Consumer on topic ${topic}`, { error: error.message });
    throw error;
  }
}

async function disconnect() {
  try {
    if (isProducerConnected && producer) await producer.disconnect();
    if (isConsumerConnected && consumer) await consumer.disconnect();
    isProducerConnected = false;
    isConsumerConnected = false;
    logger.info('Kafka disconnected');
  } catch (error) {
    logger.error('Error disconnecting Kafka', { error: error.message });
  }
}

module.exports = {
  publishMessage,
  startConsumer,
  disconnect,
};
