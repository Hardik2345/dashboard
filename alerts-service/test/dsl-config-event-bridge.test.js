const test = require('node:test');
const assert = require('node:assert/strict');

const { buildDslConfigEventBridge } = require('../services/dslConfigEventBridge');

function makeLogger() {
  const entries = [];
  return {
    entries,
    info: (msg, meta) => entries.push({ level: 'info', msg, meta }),
    warn: (msg, meta) => entries.push({ level: 'warn', msg, meta }),
    error: (msg, meta) => entries.push({ level: 'error', msg, meta }),
  };
}

const sampleEnvelope = {
  eventId: 'evt-1',
  eventType: 'alert.config.updated',
  tenantId: 'TMC',
  brandId: 3,
  alertId: 99,
  idempotencyKey: 'alert-config:99:v1:updated',
  occurredAt: new Date().toISOString(),
  source: 'alerts-api',
  payload: { name: 'A' },
};

test('bridge returns skipped when disabled', async () => {
  let called = false;
  const bridge = buildDslConfigEventBridge({
    enabled: false,
    fetch: async () => {
      called = true;
      return { status: 202 };
    },
  });

  const res = await bridge.sendConfigEventToDsl(sampleEnvelope);
  assert.equal(res.skipped, true);
  assert.equal(called, false);
});

test('bridge fails fast when enabled and baseUrl is missing', () => {
  assert.throws(() => {
    buildDslConfigEventBridge({ enabled: true, baseUrl: '', fetch: async () => ({ status: 202 }) });
  }, /DSL_ENGINE_BASE_URL is required/);
});

test('bridge posts with bearer token and tenant path', async () => {
  let call;
  const logger = makeLogger();
  const bridge = buildDslConfigEventBridge({
    enabled: true,
    baseUrl: 'http://dsl-engine.local/',
    token: 'secret-token',
    logger,
    fetch: async (url, init) => {
      call = { url, init };
      return { status: 202 };
    },
  });

  const res = await bridge.sendConfigEventToDsl(sampleEnvelope);
  assert.equal(res.statusCode, 202);
  assert.equal(call.url, 'http://dsl-engine.local/tenants/TMC/alerts/config-events');
  assert.equal(call.init.headers.Authorization, 'Bearer secret-token');
  assert.equal(call.init.method, 'POST');
});

test('bridge retries transient 5xx then succeeds', async () => {
  let attempts = 0;
  const bridge = buildDslConfigEventBridge({
    enabled: true,
    baseUrl: 'http://dsl-engine.local',
    retryCount: 2,
    backoffMs: 0,
    fetch: async () => {
      attempts += 1;
      if (attempts < 3) return { status: 503 };
      return { status: 202 };
    },
  });

  const res = await bridge.sendConfigEventToDsl(sampleEnvelope);
  assert.equal(res.statusCode, 202);
  assert.equal(attempts, 3);
});

test('bridge does not retry permanent 4xx failures', async () => {
  let attempts = 0;
  const bridge = buildDslConfigEventBridge({
    enabled: true,
    baseUrl: 'http://dsl-engine.local',
    retryCount: 3,
    backoffMs: 0,
    fetch: async () => {
      attempts += 1;
      return { status: 401 };
    },
  });

  await assert.rejects(() => bridge.sendConfigEventToDsl(sampleEnvelope), /status 401/);
  assert.equal(attempts, 1);
});
