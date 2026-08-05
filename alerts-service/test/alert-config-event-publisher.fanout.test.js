const test = require('node:test');
const assert = require('node:assert/strict');

process.env.BRAND_LIST = 'PTS';

const { buildAlertConfigEventPublisher } = require('../services/alertConfigEventPublisher');

function sampleAlert() {
  return {
    id: 123,
    brand_id: 1,
    name: 'Test Alert',
    metric_name: 'sessions',
    metric_type: 'base',
    threshold_type: 'more_than',
    threshold_value: 100,
    critical_threshold: 150,
    severity: 'high',
    cooldown_minutes: 30,
    is_active: 1,
    created_at: new Date('2026-03-06T10:00:00Z'),
    updated_at: new Date('2026-03-06T10:01:00Z'),
  };
}

test('publisher fans out the exact same envelope instance to Rabbit and DSL', async () => {
  let rabbitMessage;
  let dslEnvelope;

  const publisher = buildAlertConfigEventPublisher({
    source: 'alerts-api',
    schemaVersion: '1',
    transport: {
      publish: async ({ message }) => {
        rabbitMessage = message;
      },
      isDisabled: () => false,
    },
    dslBridge: {
      sendConfigEventToDsl: async (event) => {
        dslEnvelope = event;
        return { statusCode: 202 };
      },
      isEnabled: () => true,
    },
    logger: { info() {}, warn() {}, error() {} },
  });

  const out = await publisher.publishAlertConfigEvent({
    eventType: 'alert.config.updated',
    alert: sampleAlert(),
  });

  assert.ok(rabbitMessage);
  assert.ok(dslEnvelope);
  assert.strictEqual(rabbitMessage, dslEnvelope);
  assert.strictEqual(out, rabbitMessage);
});
