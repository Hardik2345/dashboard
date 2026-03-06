const amqp = require('amqplib');
const logger = require('../utils/logger');

function isTruthyEnv(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function buildRabbitMqTopicPublisher(options = {}) {
  const exchange = options.exchange || process.env.RABBITMQ_EXCHANGE || 'alerts.events';
  const url = options.url || process.env.RABBITMQ_URL;
  const disabled = options.disabled != null
    ? Boolean(options.disabled)
    : isTruthyEnv(process.env.RABBITMQ_PUBLISH_DISABLED);
  const log = options.logger || logger;

  let connection = null;
  let channel = null;
  let connectPromise = null;

  function resetConnectionState() {
    channel = null;
    connection = null;
    connectPromise = null;
  }

  async function ensureChannel() {
    if (disabled) return null;
    if (channel) return channel;
    if (connectPromise) return connectPromise;
    if (!url) {
      throw new Error('RABBITMQ_URL is required when RabbitMQ publishing is enabled');
    }

    connectPromise = (async () => {
      const conn = await amqp.connect(url);
      conn.on('error', (err) => {
        log.error('[alerts-rabbitmq] connection error', { message: err.message });
      });
      conn.on('close', () => {
        log.warn('[alerts-rabbitmq] connection closed');
        resetConnectionState();
      });

      const ch = await conn.createChannel();
      ch.on('error', (err) => {
        log.error('[alerts-rabbitmq] channel error', { message: err.message });
      });
      ch.on('close', () => {
        log.warn('[alerts-rabbitmq] channel closed');
        channel = null;
      });
      await ch.assertExchange(exchange, 'topic', { durable: true });

      connection = conn;
      channel = ch;
      connectPromise = null;
      return ch;
    })();

    try {
      return await connectPromise;
    } catch (err) {
      connectPromise = null;
      throw err;
    }
  }

  async function publish({ routingKey, message }) {
    if (!routingKey) throw new Error('routingKey is required');
    if (message == null) throw new Error('message is required');

    if (disabled) {
      log.info('[alerts-rabbitmq] publish disabled (dry-run)', {
        exchange,
        routingKey,
        eventType: message.eventType,
        alertId: message.alertId,
      });
      return { disabled: true, exchange, routingKey };
    }

    const ch = await ensureChannel();
    const body = Buffer.from(JSON.stringify(message));
    const accepted = ch.publish(exchange, routingKey, body, {
      persistent: true,
      contentType: 'application/json',
      messageId: message.eventId,
      type: message.eventType,
      timestamp: Date.now(),
    });

    if (!accepted) {
      log.warn('[alerts-rabbitmq] channel backpressure while publishing', {
        exchange,
        routingKey,
        eventType: message.eventType,
      });
    }

    return { accepted, exchange, routingKey };
  }

  async function close() {
    const ch = channel;
    const conn = connection;
    resetConnectionState();

    try {
      if (ch) await ch.close();
    } catch (err) {
      log.warn('[alerts-rabbitmq] channel close failed', { message: err.message });
    }
    try {
      if (conn) await conn.close();
    } catch (err) {
      log.warn('[alerts-rabbitmq] connection close failed', { message: err.message });
    }
  }

  return {
    publish,
    close,
    isDisabled: () => disabled,
  };
}

module.exports = { buildRabbitMqTopicPublisher };
