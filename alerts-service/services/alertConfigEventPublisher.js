const logger = require('../utils/logger');
const { normalizeAlertConfigEvent } = require('./alertConfigEventNormalizer');
const { buildRabbitMqTopicPublisher } = require('./rabbitmqTopicPublisher');

const EVENT_ROUTING_KEYS = Object.freeze({
  'alert.config.created': 'alerts.config.created',
  'alert.config.updated': 'alerts.config.updated',
  'alert.config.deleted': 'alerts.config.deleted',
});

function buildAlertConfigEventPublisher(options = {}) {
  const log = options.logger || logger;
  const transport = options.transport || buildRabbitMqTopicPublisher(options.rabbitmq || {});
  const source = options.source || process.env.ALERTS_EVENTS_SOURCE || 'alerts-api';
  const schemaVersion = options.schemaVersion || '1';

  async function publishAlertConfigEvent({ eventType, alert, traceId, correlationId }) {
    const routingKey = EVENT_ROUTING_KEYS[eventType];
    if (!routingKey) {
      throw new Error(`No routing key configured for eventType=${eventType}`);
    }

    const event = normalizeAlertConfigEvent({
      eventType,
      alert,
      source,
      schemaVersion,
      traceId,
      correlationId,
    });

    await transport.publish({ routingKey, message: event });
    log.info('[alerts-events] published alert config event', {
      eventType,
      routingKey,
      alertId: event.alertId,
      brandId: event.brandId,
      tenantId: event.tenantId,
    });
    return event;
  }

  return {
    publishAlertConfigEvent,
    close: transport.close ? transport.close.bind(transport) : async () => {},
    isDisabled: transport.isDisabled ? transport.isDisabled.bind(transport) : () => false,
  };
}

module.exports = {
  EVENT_ROUTING_KEYS,
  buildAlertConfigEventPublisher,
};
