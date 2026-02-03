const { AlertSchema, AlertStatusSchema } = require('../validation/schemas');
const { requireBrandKey } = require('../utils/brandHelpers');
const { getBrandById } = require('../config/brands');
const logger = require('../utils/logger');
const { ObjectId } = require('mongodb');

// No longer using Sequelize models for main alerts source of truth,
// but we keep them in args if needed for legacy or cleanup.
// We received `getMongoDb` in dependencies.
function buildAlertsController({ Alert, AlertChannel, BrandAlertChannel, getMongoDb }) {

  function getCollection() {
    const db = getMongoDb ? getMongoDb() : null;
    if (!db) throw new Error('MongoDB not connected');
    return db.collection('alerts');
  }

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

  function formatAlertDocument(doc, brandChannelConfig = null) {
    const brandMeta = getBrandById(doc.brand_id);

    // Recipients: prioritize custom recipients in doc, else brand channel
    let recipients = [];
    if (doc.have_recipients && Array.isArray(doc.recipients)) {
      recipients = doc.recipients;
    } else if (brandChannelConfig) {
      recipients = Array.isArray(brandChannelConfig.to) ? brandChannelConfig.to : [];
    }

    return {
      id: doc._id.toString(), // Convert ObjectId to string for frontend
      name: doc.name || null,
      brand_id: doc.brand_id,
      brand_key: brandMeta?.key || null,
      metric_name: doc.metric_name,
      metric_type: doc.metric_type,
      formula: doc.formula || null,
      threshold_type: doc.threshold_type,
      threshold_value: doc.threshold_value != null ? Number(doc.threshold_value) : null,
      critical_threshold: doc.critical_threshold != null ? Number(doc.critical_threshold) : null,
      severity: doc.severity,
      cooldown_minutes: doc.cooldown_minutes != null ? Number(doc.cooldown_minutes) : null,
      lookback_days: doc.lookback_days != null ? Number(doc.lookback_days) : null,
      have_recipients: doc.have_recipients ? 1 : 0,
      quiet_hours_start: hourToDisplay(doc.quiet_hours_start),
      quiet_hours_end: hourToDisplay(doc.quiet_hours_end),
      recipients,
      is_active: doc.is_active ? 1 : 0, // frontend expects 1/0 number often
      last_triggered_at: doc.last_triggered_at || null,
      created_at: doc.created_at,
      updated_at: doc.updated_at || doc.created_at,
    };
  }

  function buildAlertDocument(payload, brandId, existing = null) {
    const lookbackDaysInput = payload.lookback_days != null ? Number(payload.lookback_days) : null;
    // We don't support explicit lookback_start/end in input payload mostly, usually derivation.
    // If user provided them for some reason, we could usage them.
    // Simplifying: we only rely on lookback_days for now as per previous logic which preferred it.

    const resolvedLookback = lookbackDaysInput != null ? lookbackDaysInput : (existing?.lookback_days ?? null);

    const cooldown = payload.cooldown_minutes == null
      ? (existing?.cooldown_minutes ?? 30)
      : Number(payload.cooldown_minutes);

    const isActive = payload.is_active == null
      ? (existing?.is_active ?? true) // default true if new
      : Boolean(payload.is_active);

    const name = payload.name && payload.name.trim().length
      ? payload.name.trim()
      : (existing?.name || payload.metric_name || 'Alert');

    const quietStart = parseHourInput(payload.quiet_hours_start, existing?.quiet_hours_start ?? null);
    const quietEnd = parseHourInput(payload.quiet_hours_end, existing?.quiet_hours_end ?? null);

    const haveRecipients = Boolean(payload.have_recipients);
    const recipients = haveRecipients && Array.isArray(payload.recipients) ? payload.recipients : [];

    const now = new Date();

    return {
      brand_id: brandId, // Number
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
      have_recipients: haveRecipients,
      recipients: recipients, // Embedded directly
      quiet_hours_start: quietStart,
      quiet_hours_end: quietEnd,
      is_active: isActive,
      updated_at: now,
      created_at: existing?.created_at || now,
      last_triggered_at: existing?.last_triggered_at || null,
    };
  }

  async function listAlerts(req, res) {
    try {
      const brandParam = (req.query?.brand_key || '').toString().trim();
      const query = {};

      const channelMap = new Map();

      if (brandParam) {
        const brandInfo = resolveBrand(brandParam);
        if (brandInfo.error) return res.status(400).json({ error: brandInfo.error });
        query.brand_id = brandInfo.brandId;
      }

      const collection = getCollection();
      const alerts = await collection.find(query).sort({ created_at: -1 }).toArray();

      // Load brand-level recipients for fallback
      // We still use Sequelize for `BrandsAlertChannel` if it exists, or could migrate that too.
      // Instruction said "fetch from mongodb alerts collection". 
      // Assuming BrandAlertChannel is still in MySQL as it wasn't explicitly mentioned to migrate, 
      // but typical pattern suggests we might want to stay consistent.
      // However, to minimize scope creep and risk, I will keep reading BrandAlertChannel from MySQL
      // since it lives in a different table/concept.

      const brandIds = [...new Set(alerts.map(a => a.brand_id))];
      if (BrandAlertChannel && brandIds.length) {
        const brandChannels = await BrandAlertChannel.findAll({
          where: { brand_id: brandIds, is_active: 1, channel_type: 'email' }
        });
        function parseChannelConfig(raw) {
          if (!raw) return null;
          if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return null; } }
          return raw;
        }
        for (const bc of brandChannels) {
          channelMap.set(bc.brand_id, parseChannelConfig(bc.channel_config));
        }
      }

      const payload = alerts.map((doc) => {
        return formatAlertDocument(doc, channelMap.get(doc.brand_id));
      });

      return res.json({ alerts: payload });

    } catch (err) {
      console.error('[alerts-mongo] list failed', err);
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

      const doc = buildAlertDocument({ ...data, brand_key: brandInfo.key }, brandInfo.brandId);

      const collection = getCollection();
      const result = await collection.insertOne(doc);

      // Fetch back to return formatted
      const inserted = await collection.findOne({ _id: result.insertedId });

      // Brand channel config for display
      let channelConfig = null;
      if (BrandAlertChannel) {
        function parseChannelConfig(raw) {
          if (!raw) return null;
          if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return null; } }
          return raw;
        }
        const bc = await BrandAlertChannel.findOne({ where: { brand_id: brandInfo.brandId, is_active: 1, channel_type: 'email' } });
        if (bc) channelConfig = parseChannelConfig(bc.channel_config);
      }

      return res.status(201).json({ alert: formatAlertDocument(inserted, channelConfig) });
    } catch (err) {
      console.error('[alerts-mongo] create failed', err);
      return res.status(500).json({ error: 'Failed to create alert', details: err.message });
    }
  }

  async function updateAlert(req, res) {
    try {
      const idStr = req.params.id;
      if (!ObjectId.isValid(idStr)) return res.status(400).json({ error: 'Invalid id' });

      const parsed = AlertSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      }

      const collection = getCollection();
      const existing = await collection.findOne({ _id: new ObjectId(idStr) });
      if (!existing) return res.status(404).json({ error: 'Alert not found' });

      const data = parsed.data;
      const brandInfo = resolveBrand(data.brand_key);
      if (brandInfo.error) return res.status(400).json({ error: brandInfo.error });

      const updateDoc = buildAlertDocument({ ...data, brand_key: brandInfo.key }, brandInfo.brandId, existing);

      await collection.updateOne({ _id: new ObjectId(idStr) }, { $set: updateDoc });
      const updated = await collection.findOne({ _id: new ObjectId(idStr) });

      let channelConfig = null;
      if (BrandAlertChannel) {
        function parseChannelConfig(raw) {
          if (!raw) return null;
          if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return null; } }
          return raw;
        }
        const bc = await BrandAlertChannel.findOne({ where: { brand_id: brandInfo.brandId, is_active: 1, channel_type: 'email' } });
        if (bc) channelConfig = parseChannelConfig(bc.channel_config);
      }

      return res.json({ alert: formatAlertDocument(updated, channelConfig) });

    } catch (err) {
      console.error('[alerts-mongo] update failed', err);
      return res.status(500).json({ error: 'Failed to update alert' });
    }
  }

  async function deleteAlert(req, res) {
    try {
      const idStr = req.params.id;
      if (!ObjectId.isValid(idStr)) return res.status(400).json({ error: 'Invalid id' });

      const collection = getCollection();
      const result = await collection.deleteOne({ _id: new ObjectId(idStr) });

      if (result.deletedCount === 0) return res.status(404).json({ error: 'Alert not found' });

      return res.status(204).end();
    } catch (err) {
      console.error('[alerts-mongo] delete failed', err);
      return res.status(500).json({ error: 'Failed to delete alert' });
    }
  }

  async function setAlertStatus(req, res) {
    try {
      const idStr = req.params.id;
      if (!ObjectId.isValid(idStr)) return res.status(400).json({ error: 'Invalid id' });

      const parsed = AlertStatusSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid status', details: parsed.error.flatten() });
      }

      const collection = getCollection();
      const existing = await collection.findOne({ _id: new ObjectId(idStr) });
      if (!existing) return res.status(404).json({ error: 'Alert not found' });

      const isActive = parsed.data.is_active; // boolean
      await collection.updateOne({ _id: new ObjectId(idStr) }, { $set: { is_active: isActive } });
      const updated = await collection.findOne({ _id: new ObjectId(idStr) });

      let channelConfig = null;
      if (BrandAlertChannel) {
        function parseChannelConfig(raw) {
          if (!raw) return null;
          if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return null; } }
          return raw;
        }
        const bc = await BrandAlertChannel.findOne({ where: { brand_id: existing.brand_id, is_active: 1, channel_type: 'email' } });
        if (bc) channelConfig = parseChannelConfig(bc.channel_config);
      }

      return res.json({ alert: formatAlertDocument(updated, channelConfig) });

    } catch (err) {
      console.error('[alerts-mongo] status update failed', err);
      return res.status(500).json({ error: 'Failed to update status' });
    }
  }

  async function processEvent(req, res) {
    try {
      const event = req.body || {};
      const { brand_id } = event;
      if (!brand_id) return res.status(400).json({ error: 'Missing brand_id' });

      const { getBrandById } = require('../config/brands');
      const { getBrandConnection } = require('../lib/brandConnectionManager');

      // 1. Fetch active alerts for this brand (Mongo)
      const collection = getCollection();
      // Note: is_active might be boolean true in Mongo or 1. Let's support both if migrated, but new ones are boolean.
      // Actually `buildAlertDocument` sets `is_active` to boolean.
      // But let's check both for safety if mixed. 
      // Safest: $in: [true, 1]
      const alerts = await collection.find({
        brand_id: Number(brand_id),
        is_active: { $in: [true, 1] }
      }).toArray();

      if (!alerts.length) {
        return res.json({ message: 'No active alerts for brand' });
      }

      // 2. Resolve Brand DB Connection
      const brandInfo = getBrandById(brand_id);
      if (!brandInfo) {
        console.error(`[Webhooks] Brand ID ${brand_id} not found in config`);
        return res.status(400).json({ error: 'Invalid brand_id configuration' });
      }

      let history = [];
      try {
        const brandConn = await getBrandConnection(brandInfo);
        // Query brand DB using raw SQL 
        const results = await brandConn.sequelize.query(
          `SELECT * FROM overall_summary ORDER BY date DESC LIMIT 5`
        );
        history = results;
        // If using sequelize.query with raw:true or similar default, it might return [results, metadata] depending on driver.
        // With mysql2 and default config it often returns array of rows if type is SELECT.
        // Assuming it returns array of rows based on previous code usage (it was used as `history = results`).
        if (Array.isArray(results) && Array.isArray(results[0])) {
          // sometimes it returns [ [rows], [metadata] ]
          history = results[0];
        } else if (Array.isArray(results)) {
          history = results;
        }
      } catch (dbErr) {
        console.error(`[Webhooks] Failed to connect to brand DB for ${brandInfo.key}`, dbErr);
        return res.status(500).json({ error: 'Brand database unavailable', details: String(dbErr) });
      }

      const now = new Date();
      const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
      const currentIstHour = istTime.getUTCHours();

      let triggeredCount = 0;
      const debugLogs = [];
      debugLogs.push(`Found ${alerts.length} active alerts`);
      debugLogs.push(`Current IST Hour: ${currentIstHour}`);

      for (const alert of alerts) {
        let logEntry = { name: alert.name, id: alert._id.toString() };
        try {
          // A. Calculate Current CVR
          const keys = Object.keys(event);
          const values = Object.values(event);
          const func = new Function(...keys, `return (${alert.formula});`);
          const currentVal = func(...values);
          logEntry.currentVal = currentVal;

          if (currentVal === undefined || currentVal === null || isNaN(currentVal)) {
            logEntry.status = 'Skipped: Invalid formula result';
            debugLogs.push(logEntry);
            continue;
          }

          // B. Calculate Average from History
          let avgVal = 0;
          if (history.length) {
            const lookback = alert.lookback_days || 7;
            const relevantHistory = history.slice(0, lookback);
            let sum = 0;
            let count = 0;
            for (const row of relevantHistory) {
              try {
                const rowValues = keys.map(k => row[k]);
                const val = func(...rowValues);
                if (!isNaN(val)) {
                  sum += Number(val);
                  count++;
                }
              } catch (e) { }
            }
            if (count > 0) avgVal = sum / count;
          }
          logEntry.avgVal = avgVal;

          // C. Calculate Difference
          let percentDiff = 0;
          if (avgVal > 0) {
            percentDiff = ((currentVal - avgVal) / avgVal) * 100;
          } else if (currentVal > 0) {
            percentDiff = 100;
          }
          logEntry.percentDiff = percentDiff;
          logEntry.threshold = alert.threshold_value;
          logEntry.thresholdType = alert.threshold_type;

          let triggered = false;

          if (alert.threshold_type === 'percentage_drop') {
            if (percentDiff < 0 && Math.abs(percentDiff) > alert.threshold_value) triggered = true;
          } else if (alert.threshold_type === 'percentage_rise') {
            if (percentDiff > alert.threshold_value) triggered = true;
          } else if (alert.threshold_type === 'less_than') {
            if (currentVal < alert.threshold_value) triggered = true;
          } else if (alert.threshold_type === 'more_than' || alert.threshold_type === 'greater_than') {
            if (currentVal > alert.threshold_value) triggered = true;
          }

          logEntry.triggeredCondition = triggered;

          // D. Quiet Hours
          if (triggered) {
            if (alert.quiet_hours_start !== null && alert.quiet_hours_end !== null) {
              const s = alert.quiet_hours_start;
              const e = alert.quiet_hours_end;
              let isQuiet = false;
              if (s < e) {
                if (currentIstHour >= s && currentIstHour < e) isQuiet = true;
              } else {
                if (currentIstHour >= s || currentIstHour < e) isQuiet = true;
              }

              if (isQuiet) {
                logEntry.isQuiet = true;
                if (alert.critical_threshold) {
                  if (alert.threshold_type === 'percentage_drop') {
                    if (Math.abs(percentDiff) > alert.critical_threshold) {
                      triggered = true; // Override
                      logEntry.criticalOverride = true;
                    } else {
                      triggered = false;
                    }
                  } else {
                    triggered = false; // Blocked for now
                  }
                } else {
                  triggered = false;
                }
              }
            }
          }

          // E. Cooldown
          if (triggered) {
            if (alert.last_triggered_at) {
              const last = new Date(alert.last_triggered_at);
              const diffMins = (now - last) / 60000;
              if (diffMins < (alert.cooldown_minutes || 30)) {
                triggered = false;
                logEntry.cooldownActive = true;
              }
            }
          }

          if (triggered) {
            // Update last_triggered_at in Mongo
            await collection.updateOne({ _id: alert._id }, { $set: { last_triggered_at: istTime } });

            triggeredCount++;
            logEntry.action = 'Notification Sent';
          } else {
            logEntry.action = 'Not Sent';
          }

          debugLogs.push(logEntry);

        } catch (innerErr) {
          console.error(`[Alerts] Error processing alert ${alert._id}`, innerErr);
        }
      }

      logger.debug('--- Alert Processing Summary ---');
      debugLogs.forEach(entry => {
        if (typeof entry === 'string') {
          logger.debug(entry);
        } else {
          const log = entry;
          logger.debug(`[Alert: ${log.name}] Action: ${log.action}`);
          if (log.action === 'Not Sent') {
            const reasons = [];
            if (!log.triggeredCondition) {
              reasons.push(`Condition not met`);
              reasons.push(`Type: ${log.thresholdType}`);
              reasons.push(`Current: ${log.currentVal?.toFixed(2)}%`);
              reasons.push(`Avg: ${log.avgVal?.toFixed(2)}%`);
              reasons.push(`Diff: ${log.percentDiff?.toFixed(2)}%`);
            }
            if (log.isQuiet && !log.criticalOverride) reasons.push('Quiet Hours Active');
            if (log.cooldownActive) reasons.push('Cooldown Active');
            logger.debug(`   Details: ${reasons.join(', ')}`);
          } else {
            logger.debug(`   Triggered! Current: ${log.currentVal?.toFixed(2)}% (Threshold: ${log.threshold})`);
          }
        }
      });
      logger.debug('--------------------------------');

      return res.json({ success: true, triggered: triggeredCount });
    } catch (err) {
      console.error('[Webhooks] processEvent failed', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  return {
    listAlerts,
    createAlert,
    updateAlert,
    deleteAlert,
    setAlertStatus,
    processEvent,
  };
}

module.exports = { buildAlertsController };
