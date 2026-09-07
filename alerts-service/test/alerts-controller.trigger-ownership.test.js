const test = require('node:test');
const assert = require('node:assert/strict');

process.env.BRAND_LIST = 'PTS';

const { buildAlertsController } = require('../controllers/alertsController');

function makeRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    },
  };
}

function basePayload(overrides = {}) {
  return {
    brand_key: 'PTS',
    metric_name: 'sessions',
    threshold_type: 'more_than',
    threshold_value: 10,
    ...overrides,
  };
}

function makeController(overrides = {}) {
  const Alert = {
    create: async () => ({ id: 101 }),
    findOne: async () => null,
    updateOne: async () => ({ acknowledged: true }),
    ...overrides.Alert,
  };

  const AlertChannel = {
    create: async () => null,
    findOne: async () => null,
    updateOne: async () => ({ acknowledged: true }),
    deleteMany: async () => ({ acknowledged: true }),
    ...overrides.AlertChannel,
  };

  const BrandAlertChannel = {
    findOne: () => ({ lean: async () => null }),
    ...overrides.BrandAlertChannel,
  };

  const getNextSeq = overrides.getNextSeq || (async () => 101);

  return {
    controller: buildAlertsController({
      Alert,
      AlertChannel,
      BrandAlertChannel,
      getNextSeq,
      alertConfigEventPublisher: null,
    }),
    deps: { Alert, AlertChannel, BrandAlertChannel },
  };
}

test('createAlert applies alert_system defaults when DSL fields are missing', async () => {
  let createdValues;
  const { controller } = makeController({
    Alert: {
      create: async (payload) => {
        createdValues = payload;
        return payload;
      },
    },
  });

  const req = { body: basePayload(), headers: {} };
  const res = makeRes();

  await controller.createAlert(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(createdValues.is_dsl_engine_alert, false);
  assert.equal(createdValues.trigger_mode, 'alert_system');
  assert.equal(res.payload.alert.is_dsl_engine_alert, false);
  assert.equal(res.payload.alert.trigger_mode, 'alert_system');
});

test('createAlert accepts explicit DSL ownership fields', async () => {
  let createdValues;
  const { controller } = makeController({
    Alert: {
      create: async (payload) => {
        createdValues = payload;
        return payload;
      },
    },
  });

  const req = {
    body: basePayload({
      is_dsl_engine_alert: true,
      trigger_mode: 'dsl_engine',
    }),
    headers: {},
  };
  const res = makeRes();

  await controller.createAlert(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(createdValues.is_dsl_engine_alert, true);
  assert.equal(createdValues.trigger_mode, 'dsl_engine');
  assert.equal(res.payload.alert.is_dsl_engine_alert, true);
  assert.equal(res.payload.alert.trigger_mode, 'dsl_engine');
});

test('updateAlert accepts explicit DSL ownership fields', async () => {
  const existing = {
    _id: 'abc123',
    id: 101,
    brand_id: 1,
    name: 'Old',
    metric_name: 'sessions',
    metric_type: 'base',
    threshold_type: 'more_than',
    threshold_value: 5,
    severity: 'low',
    cooldown_minutes: 30,
    have_recipients: 0,
    is_active: 1,
    is_dsl_engine_alert: false,
    trigger_mode: 'alert_system',
    created_at: new Date(),
    updated_at: new Date(),
  };

  const updated = {
    ...existing,
    is_dsl_engine_alert: true,
    trigger_mode: 'dsl_engine',
  };

  let findOneCalls = 0;
  let updateSet;

  const { controller } = makeController({
    Alert: {
      findOne: async () => {
        findOneCalls += 1;
        return findOneCalls === 1 ? existing : updated;
      },
      updateOne: async (_query, update) => {
        updateSet = update.$set;
        return { acknowledged: true };
      },
    },
  });

  const req = {
    params: { id: '101' },
    body: basePayload({
      is_dsl_engine_alert: true,
      trigger_mode: 'dsl_engine',
      have_recipients: 0,
    }),
    headers: {},
  };
  const res = makeRes();

  await controller.updateAlert(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(updateSet.is_dsl_engine_alert, true);
  assert.equal(updateSet.trigger_mode, 'dsl_engine');
  assert.equal(res.payload.alert.is_dsl_engine_alert, true);
  assert.equal(res.payload.alert.trigger_mode, 'dsl_engine');
});

test('createAlert rejects invalid trigger_mode', async () => {
  let createCalled = false;
  const { controller } = makeController({
    Alert: {
      create: async () => {
        createCalled = true;
        return {};
      },
    },
  });

  const req = {
    body: basePayload({ trigger_mode: 'not-valid' }),
    headers: {},
  };
  const res = makeRes();

  await controller.createAlert(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(createCalled, false);
  assert.equal(res.payload.error, 'Invalid input');
});
