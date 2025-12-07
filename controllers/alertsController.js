const { AlertSchema, AlertStatusSchema } = require('../validation/schemas');
const { requireBrandKey } = require('../utils/brandHelpers');
const { getBrandById } = require('../config/brands');

const CHANNEL_TYPE_EMAIL = 'email';
const DEFAULT_SMTP_USER = process.env.ALERT_SMTP_USER || 'projects.techit@gmail.com';
const DEFAULT_SMTP_PASS = process.env.ALERT_SMTP_PASS || 'vqbvrbnezcwqgruw';

function buildAlertsController({ Alert, AlertChannel = null }) {
  function hourToDisplay(value) {
    if (value === null || value === undefined) return '';
    const num = Number(value);
    if (!Number.isFinite(num)) return '';
    const clamped = Math.max(0, Math.min(23, Math.round(num)));
    return `${String(clamped).padStart(2, '0')}:00`;
  }

  function parseHourInput(input, existing = null) {
    if (input === undefined) return existing ?? null;
    if (input === null || input === '') return null;
    if (typeof input === 'number' && Number.isFinite(input)) {
      return Math.max(0, Math.min(23, Math.round(input)));
    }
    if (typeof input === 'string') {
      const trimmed = input.trim();
      if (!trimmed) return null;
      if (/^\d{1,2}$/.test(trimmed)) {
        return Math.max(0, Math.min(23, Number(trimmed)));
      }
      if (/^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed)) {
        return Number(trimmed.slice(0, 2));
      }
    }
    return existing ?? null;
  }

  function computeLookbackDays(start, end, overrideDays) {
    if (typeof overrideDays === 'number' && Number.isFinite(overrideDays)) {
      return overrideDays;
    }
    if (!start || !end) return null;
    const startDate = Date.parse(`${start}T00:00:00Z`);
    const endDate = Date.parse(`${end}T00:00:00Z`);
    if (!Number.isFinite(startDate) || !Number.isFinite(endDate) || endDate < startDate) {
      return null;
    }
    const diffDays = Math.floor((endDate - startDate) / 86400000) + 1;
    return diffDays > 0 ? diffDays : null;
  }

  function resolveBrand(brandKey) {
    const brandCheck = requireBrandKey(brandKey);
    if (brandCheck.error) return brandCheck;
    const brandId = Number(brandCheck.cfg.brandId);
    if (!Number.isFinite(brandId) || brandId <= 0) {
      return { error: `brand_id not configured for ${brandCheck.key}. Set ${brandCheck.key}_BRAND_ID or add 'brandId' to BRANDS_CONFIG.` };
    }
    return { key: brandCheck.key, brandId };
  }

  function formatAlertRow(row, options = {}) {
    const src = typeof row.toJSON === 'function' ? row.toJSON() : row;
    const brandMeta = getBrandById(src.brand_id);
    const channelConfig = options.channelConfig || null;
    const recipients = Array.isArray(channelConfig?.to) ? channelConfig.to : [];
    return {
      id: src.id,
      name: src.name || null,
      brand_id: src.brand_id,
      brand_key: brandMeta?.key || null,
      metric_name: src.metric_name,
      metric_type: src.metric_type,
      formula: src.formula || null,
      threshold_type: src.threshold_type,
      threshold_value: src.threshold_value != null ? Number(src.threshold_value) : null,
      critical_threshold: src.critical_threshold != null ? Number(src.critical_threshold) : null,
      severity: src.severity,
      cooldown_minutes: src.cooldown_minutes != null ? Number(src.cooldown_minutes) : null,
      lookback_start: null,
      lookback_end: null,
      lookback_days: src.lookback_days != null ? Number(src.lookback_days) : null,
      quiet_hours_start: hourToDisplay(src.quiet_hours_start),
      quiet_hours_end: hourToDisplay(src.quiet_hours_end),
      recipients,
      is_active: src.is_active ? 1 : 0,
      last_triggered_at: null,
      created_at: src.created_at,
      updated_at: src.updated_at || src.created_at,
    };
  }

  function buildAlertValues(payload, brandId, existing = null) {
    const lookbackDaysInput = payload.lookback_days != null ? Number(payload.lookback_days) : null;
    const derivedLookback = computeLookbackDays(payload.lookback_start, payload.lookback_end, lookbackDaysInput);
    const resolvedLookback = derivedLookback != null ? derivedLookback : existing?.lookback_days ?? null;
    const cooldown = payload.cooldown_minutes == null
      ? (existing?.cooldown_minutes ?? 30)
      : Number(payload.cooldown_minutes);
    const isActive = payload.is_active == null
      ? (existing?.is_active ?? 1)
      : (payload.is_active ? 1 : 0);
    const name = payload.name && payload.name.trim().length
      ? payload.name.trim()
      : (existing?.name || payload.metric_name || 'Alert');

    const quietStart = parseHourInput(payload.quiet_hours_start, existing?.quiet_hours_start ?? null);
    const quietEnd = parseHourInput(payload.quiet_hours_end, existing?.quiet_hours_end ?? null);

    return {
      brand_id: brandId,
      name,
      metric_name: payload.metric_name,
      metric_type: payload.metric_type,
      formula: payload.metric_type === 'derived' ? (payload.formula || null) : null,
      threshold_type: payload.threshold_type,
      threshold_value: Number(payload.threshold_value),
      critical_threshold: payload.critical_threshold == null ? null : Number(payload.critical_threshold),
      severity: payload.severity,
      cooldown_minutes: cooldown,
      lookback_days: resolvedLookback,
      quiet_hours_start: quietStart,
      quiet_hours_end: quietEnd,
      is_active: isActive ? 1 : 0,
    };
  }

  async function listAlerts(req, res) {
    try {
      const brandParam = (req.query?.brand_key || '').toString().trim();
      const where = {};
      if (brandParam) {
        const brandInfo = resolveBrand(brandParam);
        if (brandInfo.error) return res.status(400).json({ error: brandInfo.error });
        where.brand_id = brandInfo.brandId;
      }
      const alerts = await Alert.findAll({ where, order: [['id', 'DESC']] });
      const channelMap = await loadChannelMap(alerts);
      const payload = alerts.map((alert) => formatAlertRow(alert, { channelConfig: channelMap.get(alert.id) }));
      return res.json({ alerts: payload });
    } catch (err) {
      console.error('[alerts] list failed', err);
      return res.status(500).json({ error: 'Failed to load alerts' });
    }
  }

  async function createAlert(req, res) {
    try {
      const parsed = AlertSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      }
      const data = parsed.data;
      const brandInfo = resolveBrand(data.brand_key);
      if (brandInfo.error) return res.status(400).json({ error: brandInfo.error });
      const values = buildAlertValues({ ...data, brand_key: brandInfo.key }, brandInfo.brandId);
      const recipients = normalizeRecipients(data.recipients);
      let created;
      const sequelize = Alert.sequelize;
      if (sequelize && typeof sequelize.transaction === 'function') {
        await sequelize.transaction(async (transaction) => {
          created = await Alert.create(values, { transaction });
          await syncAlertChannel({
            alertId: created.id,
            brandKey: brandInfo.key,
            alertName: values.name,
            metricName: values.metric_name,
            severity: values.severity,
            recipients,
            transaction,
          });
        });
      } else {
        created = await Alert.create(values);
        await syncAlertChannel({
          alertId: created.id,
          brandKey: brandInfo.key,
          alertName: values.name,
          metricName: values.metric_name,
          severity: values.severity,
          recipients,
        });
      }
      const channelConfig = await getChannelConfig(created.id);
      return res.status(201).json({ alert: formatAlertRow(created, { channelConfig }) });
    } catch (err) {
      console.error('[alerts] create failed', err);
      return res.status(500).json({ error: 'Failed to create alert' });
    }
  }

  async function updateAlert(req, res) {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: 'Invalid id' });
      const parsed = AlertSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      }
      const existing = await Alert.findByPk(id);
      if (!existing) return res.status(404).json({ error: 'Alert not found' });
      const data = parsed.data;
      const brandInfo = resolveBrand(data.brand_key);
      if (brandInfo.error) return res.status(400).json({ error: brandInfo.error });
      const values = buildAlertValues({ ...data, brand_key: brandInfo.key }, brandInfo.brandId, existing);
      const recipients = normalizeRecipients(data.recipients);
      let updated;
      const sequelize = Alert.sequelize;
      if (sequelize && typeof sequelize.transaction === 'function') {
        await sequelize.transaction(async (transaction) => {
          updated = await existing.update(values, { transaction });
          await syncAlertChannel({
            alertId: id,
            brandKey: brandInfo.key,
            alertName: values.name,
            metricName: values.metric_name,
            severity: values.severity,
            recipients,
            transaction,
          });
        });
      } else {
        updated = await existing.update(values);
        await syncAlertChannel({
          alertId: id,
          brandKey: brandInfo.key,
          alertName: values.name,
          metricName: values.metric_name,
          severity: values.severity,
          recipients,
        });
      }
      const channelConfig = await getChannelConfig(id);
      return res.json({ alert: formatAlertRow(updated, { channelConfig }) });
    } catch (err) {
      console.error('[alerts] update failed', err);
      return res.status(500).json({ error: 'Failed to update alert' });
    }
  }

  async function deleteAlert(req, res) {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: 'Invalid id' });

      const existing = await Alert.findByPk(id);
      if (!existing) return res.status(404).json({ error: 'Alert not found' });

      const sequelize = Alert.sequelize;
      if (sequelize && typeof sequelize.transaction === 'function') {
        await sequelize.transaction(async (transaction) => {
          await removeAlertDependencies(sequelize, id, transaction);
          await Alert.destroy({ where: { id }, transaction });
        });
      } else {
        await removeAlertDependencies(Alert.sequelize || null, id, null);
        await Alert.destroy({ where: { id } });
      }

      return res.status(204).end();
    } catch (err) {
      console.error('[alerts] delete failed', err);
      return res.status(500).json({ error: 'Failed to delete alert' });
    }
  }

  async function removeAlertDependencies(sequelize, alertId, transaction) {
    if (AlertChannel) {
      try {
        await AlertChannel.destroy({ where: { alert_id: alertId }, transaction });
      } catch (err) {
        if (!isMissingTableError(err)) throw err;
      }
    } else if (sequelize && typeof sequelize.query === 'function') {
      await safeDeleteTable(sequelize, 'alert_channels', alertId, transaction);
    }

    if (sequelize && typeof sequelize.query === 'function') {
      await safeDeleteTable(sequelize, 'alert_history', alertId, transaction);
    }
  }

  async function setAlertStatus(req, res) {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: 'Invalid id' });
      const parsed = AlertStatusSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid status', details: parsed.error.flatten() });
      }
      const existing = await Alert.findByPk(id);
      if (!existing) return res.status(404).json({ error: 'Alert not found' });
      existing.is_active = parsed.data.is_active ? 1 : 0;
      await existing.save();
      return res.json({ alert: formatAlertRow(existing) });
    } catch (err) {
      console.error('[alerts] status update failed', err);
      return res.status(500).json({ error: 'Failed to update status' });
    }
  }

  async function loadChannelMap(alerts) {
    if (!AlertChannel || !Array.isArray(alerts) || !alerts.length) return new Map();
    const ids = alerts.map((row) => (typeof row.get === 'function' ? row.get('id') : row.id)).filter(Boolean);
    if (!ids.length) return new Map();
    const rows = await AlertChannel.findAll({ where: { alert_id: ids, channel_type: CHANNEL_TYPE_EMAIL } });
    const map = new Map();
    for (const row of rows) {
      const data = typeof row.toJSON === 'function' ? row.toJSON() : row;
      map.set(data.alert_id, parseChannelConfig(data.channel_config));
    }
    return map;
  }

  async function getChannelConfig(alertId, transaction) {
    if (!AlertChannel || !alertId) return null;
    const row = await AlertChannel.findOne({ where: { alert_id: alertId, channel_type: CHANNEL_TYPE_EMAIL }, transaction });
    if (!row) return null;
    const data = typeof row.toJSON === 'function' ? row.toJSON() : row;
    return parseChannelConfig(data.channel_config);
  }

  async function syncAlertChannel({ alertId, brandKey, alertName, metricName, severity, recipients, transaction }) {
    if (!AlertChannel || !alertId) return;
    const list = normalizeRecipients(recipients);
    if (!list.length) {
      await deleteAlertChannel(alertId, transaction);
      return;
    }
    const payload = {
      to: list,
      subject: buildSubject(brandKey, severity, alertName, metricName),
      smtp_user: DEFAULT_SMTP_USER,
      smtp_pass: DEFAULT_SMTP_PASS,
    };
    const existing = await AlertChannel.findOne({ where: { alert_id: alertId, channel_type: CHANNEL_TYPE_EMAIL }, transaction });
    if (existing) {
      await existing.update({ channel_config: payload }, { transaction });
    } else {
      await AlertChannel.create({ alert_id: alertId, channel_type: CHANNEL_TYPE_EMAIL, channel_config: payload }, { transaction });
    }
  }

  async function deleteAlertChannel(alertId, transaction) {
    if (!AlertChannel || !alertId) return;
    try {
      await AlertChannel.destroy({ where: { alert_id: alertId }, transaction });
    } catch (err) {
      if (!isMissingTableError(err)) throw err;
    }
  }

  function normalizeRecipients(value) {
    if (!value) return [];
    const list = Array.isArray(value) ? value : [value];
    const emails = list
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item && item.includes('@'));
    return Array.from(new Set(emails));
  }

  function buildSubject(brandKey, severity, alertName, metricName) {
    const brand = (brandKey || '').toString().trim() || 'Brand';
    const label = (alertName || metricName || 'Alert').toString().trim() || 'Alert';
    const severityLabel = (severity || '').toString().trim().toLowerCase();
    const severityPart = severityLabel ? ` ${severityLabel}` : '';
    return `${brand}${severityPart} ${label} Alert`;
  }

  function parseChannelConfig(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch { return null; }
    }
    if (typeof raw === 'object') return raw;
    return null;
  }

  async function safeDeleteTable(sequelize, table, alertId, transaction) {
    if (!sequelize || typeof sequelize.query !== 'function') return;
    try {
      await sequelize.query(`DELETE FROM ${table} WHERE alert_id = ?`, {
        replacements: [alertId],
        transaction,
      });
    } catch (err) {
      if (!isMissingTableError(err)) throw err;
    }
  }

  function isMissingTableError(err) {
    return err?.parent?.code === 'ER_NO_SUCH_TABLE';
  }

  return {
    listAlerts,
    createAlert,
    updateAlert,
    deleteAlert,
    setAlertStatus,
  };
}

module.exports = { buildAlertsController };
