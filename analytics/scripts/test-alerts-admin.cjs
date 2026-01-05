#!/usr/bin/env node
// Lightweight functional test suite for the alerts admin controller. It exercises
// create/list/update/delete/status flows plus validation edge cases using an
// in-memory Alert model so no MySQL connection is required.
process.env.NODE_ENV = 'test';
if (!process.env.BRANDS_CONFIG) {
  process.env.BRANDS_CONFIG = JSON.stringify([
    { key: 'PTS', dbHost: 'stub', dbUser: 'stub', dbPass: 'stub', brandId: 1 },
    { key: 'BBB', dbHost: 'stub', dbUser: 'stub', dbPass: 'stub', brandId: 2 },
    { key: 'TMC', dbHost: 'stub', dbUser: 'stub', dbPass: 'stub', brandId: 3 },
    { key: 'MILA', dbHost: 'stub', dbUser: 'stub', dbPass: 'stub', brandId: 4 },
  ]);
}

const { buildAlertsController } = require('../controllers/alertsController');

class FakeAlertModel {
  constructor() {
    this.rows = [];
    this.autoId = 1;
  }

  _instance(row) {
    return new FakeInstance(row);
  }

  async findAll({ where, order } = {}) {
    let rows = this.rows;
    if (where && where.brand_id != null) {
      rows = rows.filter((r) => Number(r.brand_id) === Number(where.brand_id));
    }
    const ordered = order && order[0] && order[0][0] === 'id' && order[0][1] === 'DESC'
      ? [...rows].sort((a, b) => b.id - a.id)
      : [...rows];
    return ordered.map((row) => this._instance(row));
  }

  async create(values) {
    const now = new Date().toISOString();
    const row = { ...values, id: this.autoId++, created_at: now, updated_at: now };
    this.rows.push(row);
    return this._instance(row);
  }

  async findByPk(id) {
    const row = this.rows.find((r) => Number(r.id) === Number(id));
    return row ? this._instance(row) : null;
  }

  async destroy({ where }) {
    const id = Number(where?.id);
    const idx = this.rows.findIndex((r) => Number(r.id) === id);
    if (idx === -1) return 0;
    this.rows.splice(idx, 1);
    return 1;
  }
}

class FakeAlertChannelModel {
  constructor() {
    this.rows = [];
    this.autoId = 1;
  }

  _instance(row) {
    return new FakeChannelInstance(row);
  }

  async findAll({ where } = {}) {
    let rows = [...this.rows];
    if (where && where.alert_id != null) {
      const list = Array.isArray(where.alert_id) ? where.alert_id : [where.alert_id];
      const ids = list.map((id) => Number(id));
      rows = rows.filter((r) => ids.includes(Number(r.alert_id)));
    }
    if (where && where.channel_type) {
      rows = rows.filter((r) => r.channel_type === where.channel_type);
    }
    return rows.map((row) => this._instance(row));
  }

  async findOne({ where } = {}) {
    const rows = await this.findAll({ where });
    return rows[0] || null;
  }

  async create(values) {
    const row = { ...values, id: this.autoId++ };
    this.rows.push(row);
    return this._instance(row);
  }

  async destroy({ where }) {
    if (!where || where.alert_id == null) return 0;
    const id = Number(where.alert_id);
    const before = this.rows.length;
    this.rows = this.rows.filter((row) => Number(row.alert_id) !== id);
    return before - this.rows.length;
  }
}

class FakeChannelInstance {
  constructor(row) {
    this._row = row;
    this._sync();
  }

  _sync() {
    Object.assign(this, this._row);
  }

  toJSON() {
    return { ...this._row };
  }

  async update(values) {
    Object.assign(this._row, values);
    this._sync();
    return this;
  }
}

class FakeInstance {
  constructor(row) {
    this._row = row;
    this._sync();
  }

  _sync() {
    Object.assign(this, this._row);
  }

  toJSON() {
    return { ...this._row };
  }

  async update(values) {
    Object.assign(this._row, values, { updated_at: new Date().toISOString() });
    this._sync();
    return this;
  }

  async save() {
    this._row.updated_at = new Date().toISOString();
    this._sync();
    return this;
  }
}

function execHandler(handler, { body = {}, params = {}, query = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = { body, params, query };
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        resolve({ status: this.statusCode || 200, body: payload });
      },
      end() {
        resolve({ status: this.statusCode || 200, body: null });
      },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

async function run() {
  const Alert = new FakeAlertModel();
  const AlertChannel = new FakeAlertChannelModel();
  Alert.sequelize = null;
  const controller = buildAlertsController({ Alert, AlertChannel });
  const report = [];

  async function record(name, fn) {
    try {
      const response = await fn();
      report.push({ name, ...response });
    } catch (err) {
      report.push({ name, status: 'error', error: err.message });
    }
  }

  await record('List (empty)', () => execHandler(controller.listAlerts, { query: {} }));

  let createdBase = null;
  await record('Create base alert', async () => {
    const res = await execHandler(controller.createAlert, {
      body: {
        name: 'AOV Drop',
        brand_key: 'PTS',
        metric_name: 'Average Order Value',
        metric_type: 'base',
        threshold_type: 'less_than',
        threshold_value: 10,
        critical_threshold: 4,
        severity: 'high',
        cooldown_minutes: 45,
        lookback_start: '2025-12-01',
        lookback_end: '2025-12-05',
        quiet_hours_start: '01:00',
        quiet_hours_end: '03:00',
        recipients: ['alerts@datum.test', 'alerts@datum.test'],
      },
    });
    if (res.status === 201) createdBase = res.body.alert;
    return res;
  });

  await record('List filtered PTS', () => execHandler(controller.listAlerts, { query: { brand_key: 'PTS' } }));

  await record('Update base alert', async () => {
    const res = await execHandler(controller.updateAlert, {
      params: { id: createdBase?.id },
      body: {
        name: 'AOV Drop Updated',
        brand_key: 'PTS',
        metric_name: 'Average Order Value',
        metric_type: 'base',
        threshold_type: 'less_than',
        threshold_value: 8,
        severity: 'medium',
        cooldown_minutes: 60,
        lookback_start: '2025-12-01',
        lookback_end: '2025-12-07',
        quiet_hours_start: '00:00',
        quiet_hours_end: '02:00',
        recipients: ['ops@datum.test'],
      },
    });
    return res;
  });

  await record('Toggle status OFF', () => execHandler(controller.setAlertStatus, {
    params: { id: createdBase?.id },
    body: { is_active: 0 },
  }));

  await record('Create derived alert', () => execHandler(controller.createAlert, {
    body: {
      name: 'Revenue Per Session Spike',
      brand_key: 'MILA',
      metric_name: 'RPS Spike',
      metric_type: 'derived',
      formula: 'total_revenue / sessions',
      threshold_type: 'greater_than',
      threshold_value: 120,
      severity: 'low',
      cooldown_minutes: 30,
      lookback_days: 14,
      recipients: ['science@datum.test'],
    },
  }));

  await record('Validation: derived missing formula', () => execHandler(controller.createAlert, {
    body: {
      name: 'Invalid derived',
      brand_key: 'PTS',
      metric_name: 'Bad Derived',
      metric_type: 'derived',
      threshold_type: 'absolute',
      threshold_value: 10,
      severity: 'low',
    },
  }));

  await record('Validation: quiet hours missing pair', () => execHandler(controller.createAlert, {
    body: {
      name: 'Partial quiet hours',
      brand_key: 'PTS',
      metric_name: 'Sessions',
      metric_type: 'base',
      threshold_type: 'absolute',
      threshold_value: 5,
      severity: 'low',
      quiet_hours_start: '10:00',
    },
  }));

  await record('Validation: lookback start > end', () => execHandler(controller.createAlert, {
    body: {
      name: 'Invalid lookback',
      brand_key: 'PTS',
      metric_name: 'Sessions',
      metric_type: 'base',
      threshold_type: 'absolute',
      threshold_value: 5,
      severity: 'low',
      lookback_start: '2025-12-10',
      lookback_end: '2025-12-01',
    },
  }));

  await record('Validation: missing threshold', () => execHandler(controller.createAlert, {
    body: {
      name: 'No threshold',
      brand_key: 'PTS',
      metric_name: 'Sessions',
      metric_type: 'base',
      threshold_type: 'absolute',
    },
  }));

  await record('Validation: unknown brand', () => execHandler(controller.createAlert, {
    body: {
      name: 'Unknown brand',
      brand_key: 'XYZ',
      metric_name: 'Sessions',
      metric_type: 'base',
      threshold_type: 'absolute',
      threshold_value: 5,
      severity: 'low',
    },
  }));

  await record('Delete base alert', () => execHandler(controller.deleteAlert, {
    params: { id: createdBase?.id },
  }));

  await record('List after delete', () => execHandler(controller.listAlerts, { query: {} }));

  await record('AlertChannel rows snapshot', async () => ({ status: 200, body: AlertChannel.rows }));

  console.log(JSON.stringify(report, null, 2));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
