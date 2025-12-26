const { AlertSchema, AlertStatusSchema } = require('../validation/schemas');
const { requireBrandKey } = require('../utils/brandHelpers');
const { getBrandById } = require('../config/brands');

function buildAlertsController({ Alert, AlertChannel, BrandAlertChannel }) {
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
    let recipients = [];
    
    if (src.have_recipients && options.individualChannel) {
      recipients = Array.isArray(options.individualChannel.channel_config?.to) 
        ? options.individualChannel.channel_config.to 
        : [];
    } else if (options.channelConfig) {
      recipients = Array.isArray(options.channelConfig?.to) ? options.channelConfig.to : [];
    }

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

      // Load brand-level recipients
      const brandIds = [...new Set(alerts.map(a => a.brand_id))];
      const channelMap = new Map();
      if (BrandAlertChannel && brandIds.length) {
        const brandChannels = await BrandAlertChannel.findAll({
          where: { brand_id: brandIds, is_active: 1, channel_type: 'email' } // only email
        });
        for (const bc of brandChannels) {
          channelMap.set(bc.brand_id, parseChannelConfig(bc.channel_config));
        }
      }

      // Load individual recipients if needed
      const individualChannelMap = new Map();
      const haveRecipAlertIds = alerts.filter(a => a.have_recipients).map(a => a.id);
      if (AlertChannel && haveRecipAlertIds.length) {
        const individualChannels = await AlertChannel.findAll({
          where: { alert_id: haveRecipAlertIds, channel_type: 'email' }
        });
        for (const ic of individualChannels) {
          individualChannelMap.set(ic.alert_id, ic);
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
      
      const created = await Alert.create(values);
      
      // If individual recipients toggled on, create AlertChannel
      let individualChannel = null;
      if (data.have_recipients && data.recipients?.length) {
        individualChannel = await AlertChannel.create({
          alert_id: created.id,
          brand_id: brandInfo.brandId,
          channel_type: 'email',
          channel_config: {
            to: data.recipients,
            smtp_pass: "vqbvrbnezcwqgruw",
            smtp_user: "projects.techit@gmail.com"
          }
        });
      }

      // Fetch brand-level recipients for display fallback
      let channelConfig = null;
      if (BrandAlertChannel) {
        const bc = await BrandAlertChannel.findOne({ where: { brand_id: brandInfo.brandId, is_active: 1, channel_type: 'email' } });
        if (bc) channelConfig = parseChannelConfig(bc.channel_config);
      }

      return res.status(201).json({ alert: formatAlertRow(created, { channelConfig, individualChannel }) });
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
      
      const updated = await existing.update(values);

      // Manage AlertChannel for individual recipients
      let individualChannel = null;
      if (data.have_recipients) {
        const config = {
          to: data.recipients || [],
          smtp_pass: "vqbvrbnezcwqgruw",
          smtp_user: "projects.techit@gmail.com"
        };
        const [ic, created] = await AlertChannel.findOrCreate({
          where: { alert_id: id, channel_type: 'email' },
          defaults: { brand_id: brandInfo.brandId, channel_config: config }
        });
        if (!created) {
          ic.channel_config = config;
          await ic.save();
        }
        individualChannel = ic;
      } else {
        // Toggled off: remove custom recipients
        await AlertChannel.destroy({ where: { alert_id: id, channel_type: 'email' } });
      }

      // Fetch brand-level recipients for display fallback
      let channelConfig = null;
      if (BrandAlertChannel) {
        const bc = await BrandAlertChannel.findOne({ where: { brand_id: brandInfo.brandId, is_active: 1, channel_type: 'email' } });
        if (bc) channelConfig = parseChannelConfig(bc.channel_config);
      }

      return res.json({ alert: formatAlertRow(updated, { channelConfig, individualChannel }) });
    } catch (err) {
      console.error('[alerts] update failed', err);
      return res.status(500).json({ error: 'Failed to update alert' });
    }
  }

  async function deleteAlert(req, res) {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: 'Invalid id' });

      // Delete associated individual channels first
      if (AlertChannel) {
        await AlertChannel.destroy({ where: { alert_id: id, channel_type: 'email' } });
      }

      const deleted = await Alert.destroy({ where: { id } });
      if (!deleted) return res.status(404).json({ error: 'Alert not found' });

      return res.status(204).end();
    } catch (err) {
      console.error('[alerts] delete failed', err);
      return res.status(500).json({ error: 'Failed to delete alert' });
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

      // Fetch individual recipients if needed
      let individualChannel = null;
      if (existing.have_recipients) {
        individualChannel = await AlertChannel.findOne({ where: { alert_id: existing.id, channel_type: 'email' } });
      }

      // Fetch brand-level recipients for display fallback
      let channelConfig = null;
      if (BrandAlertChannel) {
        const bc = await BrandAlertChannel.findOne({ where: { brand_id: existing.brand_id, is_active: 1, channel_type: 'email' } });
        if (bc) channelConfig = parseChannelConfig(bc.channel_config);
      }

      return res.json({ alert: formatAlertRow(existing, { channelConfig, individualChannel }) });
    } catch (err) {
      console.error('[alerts] status update failed', err);
      return res.status(500).json({ error: 'Failed to update status' });
    }
  }

  function parseChannelConfig(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch { return null; }
    }
    if (typeof raw === 'object') return raw;
    return null;
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
