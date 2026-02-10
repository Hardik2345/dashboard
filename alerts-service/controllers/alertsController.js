const { AlertSchema, AlertStatusSchema } = require('../validation/schemas');
const { requireBrandKey } = require('../utils/brandHelpers');
const { getBrandById } = require('../config/brands');
const logger = require('../utils/logger');

function buildAlertsController({ Alert, AlertChannel, BrandAlertChannel, getNextSeq }) {
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

  async function resolveBrand(brandKey) {
    const brandCheck = await requireBrandKey(brandKey);
    if (brandCheck.error) return brandCheck;
    const brandId = Number(brandCheck.brandId);
    if (!Number.isFinite(brandId) || brandId <= 0) {
      return { error: `brand_id not configured for ${brandCheck.key}` };
    }
    return { key: brandCheck.key, brandId };
  }

  function formatAlertRow(row, options = {}) {
    const src = typeof row.toJSON === 'function' ? row.toJSON() : row;
    const brandMeta = getBrandById(src.brand_id);
    let recipients = [];

    if (src.have_recipients && options.individualChannel) {
      recipients = Array.isArray(options.individualChannel.channel_config?.to)
        ? options.individualChannel.channel_config.to
        : [];
    } else if (options.channelConfig) {
      recipients = Array.isArray(options.channelConfig?.to) ? options.channelConfig.to : [];
    }

    return {
      id: src.id != null ? src.id : src._id,
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
      have_recipients: src.have_recipients ? 1 : 0,
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
      have_recipients: payload.have_recipients ? 1 : 0,
      quiet_hours_start: quietStart,
      quiet_hours_end: quietEnd,
      is_active: isActive ? 1 : 0,
    };
  }

  function parseChannelConfig(cfg) {
    if (!cfg) return null;
    if (typeof cfg === 'string') {
      try {
        return JSON.parse(cfg);
      } catch (e) {
        return null;
      }
    }
    if (typeof cfg === 'object') return cfg;
    return null;
  }

  async function listAlerts(req, res) {
    try {
      const brandParam = (req.query?.brand_key || '').toString().trim();
      const where = {};
      if (brandParam) {
        const brandInfo = await resolveBrand(brandParam);
        if (brandInfo.error) return res.status(400).json({ error: brandInfo.error });
        where.brand_id = brandInfo.brandId;
      }
      const alerts = await Alert.find(where).sort({ id: -1 }).lean();

      // Load brand-level recipients
      const brandIds = [...new Set(alerts.map(a => a.brand_id))];
      const channelMap = new Map();
      if (BrandAlertChannel && brandIds.length) {
        const brandChannels = await BrandAlertChannel.find({
          brand_id: { $in: brandIds },
          is_active: 1,
          channel_type: 'email'
        }).lean();
        for (const bc of brandChannels) {
          channelMap.set(bc.brand_id, parseChannelConfig(bc.channel_config));
        }
      }

      // Load individual recipients if needed
      const individualChannelMap = new Map();
      const haveRecipAlertIds = alerts.filter(a => a.have_recipients).map(a => a.id).filter(id => id != null);
      // NOTE: If using _id, we might need to query by that too? 
      // Current system AlertChannel maps to alert_id which is numeric id.
      // If we are migrating to _id, we have a bigger problem: AlertChannel needs to link via _id?
      // Assuming legacy data has `id` and new data might just use _id?
      // But wait, createAlert assigns `id` from sequence. So `id` MUST exist for new alerts too.
      // The issue is likely some alerts were manually created or migrated without `id`.
      // We will assume if `id` exists we use it, otherwise we skip link for now (or fix separately).

      if (AlertChannel && haveRecipAlertIds.length) {
        const individualChannels = await AlertChannel.find({
          alert_id: { $in: haveRecipAlertIds },
          channel_type: 'email'
        }).lean();
        for (const ic of individualChannels) {
          individualChannelMap.set(ic.id ? ic.id : ic.alert_id, ic);
        }
      }

      const payload = alerts.map((alert) => {
        return formatAlertRow(alert, {
          channelConfig: channelMap.get(alert.brand_id),
          individualChannel: individualChannelMap.get(alert.id)
        });
      });
      return res.json({ alerts: payload });
    } catch (err) {
      logger.error('[alerts] list failed', err);
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
      const brandInfo = await resolveBrand(data.brand_key);
      if (brandInfo.error) return res.status(400).json({ error: brandInfo.error });
      const values = buildAlertValues({ ...data, brand_key: brandInfo.key }, brandInfo.brandId);

      const nextId = await getNextSeq('alerts');
      const created = await Alert.create({ ...values, id: nextId });

      // If individual recipients toggled on, create AlertChannel
      let individualChannel = null;
      if (data.have_recipients && data.recipients?.length) {
        const chId = await getNextSeq('alert_channels');
        individualChannel = await AlertChannel.create({
          id: chId,
          alert_id: created.id,
          brand_id: brandInfo.brandId,
          channel_type: 'email',
          channel_config: { to: data.recipients },
        });
      }

      // If brand-level channel exists, load it
      let brandChannel = null;
      if (BrandAlertChannel) {
        brandChannel = await BrandAlertChannel.findOne({
          brand_id: brandInfo.brandId,
          channel_type: 'email',
          is_active: 1,
        }).lean();
      }

      return res.status(201).json({ alert: formatAlertRow(created, { channelConfig: parseChannelConfig(brandChannel?.channel_config), individualChannel }) });
    } catch (err) {
      logger.error('[alerts] create failed', err);
      return res.status(500).json({ error: 'Failed to create alert' });
    }
  }

  function resolveAlertQuery(idParam) {
    const num = Number(idParam);
    if (Number.isFinite(num)) {
      return { id: num };
    }
    return { _id: idParam };
  }

  async function updateAlert(req, res) {
    try {
      const query = resolveAlertQuery(req.params.id);
      const existing = await Alert.findOne(query);
      if (!existing) return res.status(404).json({ error: 'Alert not found' });

      const parsed = AlertSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      }
      const data = parsed.data;
      const brandInfo = await resolveBrand(data.brand_key || getBrandById(existing.brand_id)?.key);
      if (brandInfo.error) return res.status(400).json({ error: brandInfo.error });
      const values = buildAlertValues({ ...data, brand_key: brandInfo.key }, brandInfo.brandId, existing);

      await Alert.updateOne(query, { $set: values });

      // If we have a numeric ID (either queried or existing), use it for AlertChannel
      const alertId = existing.id;

      // Update / upsert individual recipients
      let individualChannel = null;
      if (alertId != null) {
        if (data.have_recipients && data.recipients?.length) {
          const payload = {
            alert_id: alertId,
            brand_id: brandInfo.brandId,
            channel_type: 'email',
            channel_config: { to: data.recipients },
          };
          const existingChannel = await AlertChannel.findOne({ alert_id: alertId, channel_type: 'email' });
          if (existingChannel) {
            await AlertChannel.updateOne({ alert_id: alertId, channel_type: 'email' }, { $set: payload });
            individualChannel = await AlertChannel.findOne({ alert_id: alertId, channel_type: 'email' }).lean();
          } else {
            payload.id = await getNextSeq('alert_channels');
            individualChannel = await AlertChannel.create(payload);
          }
        } else {
          // toggle off
          await AlertChannel.deleteMany({ alert_id: alertId });
        }
      }

      let brandChannel = null;
      if (BrandAlertChannel) {
        brandChannel = await BrandAlertChannel.findOne({
          brand_id: brandInfo.brandId,
          channel_type: 'email',
          is_active: 1,
        }).lean();
      }

      const updated = await Alert.findOne(query);
      return res.json({ alert: formatAlertRow(updated, { channelConfig: parseChannelConfig(brandChannel?.channel_config), individualChannel }) });
    } catch (err) {
      logger.error('[alerts] update failed', err);
      return res.status(500).json({ error: 'Failed to update alert' });
    }
  }

  async function deleteAlert(req, res) {
    try {
      const query = resolveAlertQuery(req.params.id);
      // If deleting by _id, we might not have alert_id for channel deletion unless we look it up.
      const existing = await Alert.findOne(query);
      if (!existing) return res.status(404).json({ error: 'Alert not found' });

      if (existing.id != null) {
        await AlertChannel.deleteMany({ alert_id: existing.id });
      }

      const deleted = await Alert.deleteOne(query);
      if (!deleted.deletedCount) return res.status(404).json({ error: 'Alert not found' });
      return res.json({ success: true });
    } catch (err) {
      logger.error('[alerts] delete failed', err);
      return res.status(500).json({ error: 'Failed to delete alert' });
    }
  }

  async function setAlertStatus(req, res) {
    try {
      const query = resolveAlertQuery(req.params.id);
      const parsed = AlertStatusSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      }
      const payload = parsed.data;
      const existing = await Alert.findOne(query);
      if (!existing) return res.status(404).json({ error: 'Alert not found' });

      const brandInfo = await resolveBrand(payload.brand_key || getBrandById(existing.brand_id)?.key);
      if (brandInfo.error) return res.status(400).json({ error: brandInfo.error });

      await Alert.updateOne(query, { $set: { is_active: payload.is_active ? 1 : 0 } });
      const updated = await Alert.findOne(query);

      let brandChannel = null;
      if (BrandAlertChannel) {
        brandChannel = await BrandAlertChannel.findOne({
          brand_id: brandInfo.brandId,
          channel_type: 'email',
          is_active: 1,
        }).lean();
      }

      return res.json({ alert: formatAlertRow(updated, { channelConfig: parseChannelConfig(brandChannel?.channel_config) }) });
    } catch (err) {
      logger.error('[alerts] set status failed', err);
      return res.status(500).json({ error: 'Failed to update alert status' });
    }
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
