const { QueryTypes } = require('sequelize');
const { BucketSchema, RangeSchema } = require('../validation/schemas');
const { requireBrandKey } = require('../utils/brandHelpers');
const { getBrandConnection } = require('../lib/brandConnectionManager');
const logger = require('../utils/logger');

function buildAdjustmentBucketsController({ SessionAdjustmentBucket, SessionAdjustmentAudit }) {
  async function listBuckets(req, res) {
    try {
      const { active, brand_key: brandKeyParam } = req.query;
      const brandCheck = requireBrandKey(brandKeyParam);
      if (brandCheck.error) return res.status(400).json({ error: brandCheck.error });
      const where = { brand_key: brandCheck.key };
      if (active === '1' || active === '0') where.active = active === '1' ? 1 : 0;
      const buckets = await SessionAdjustmentBucket.findAll({ where, order: [['priority','ASC'], ['id','ASC']] });
      return res.json({ buckets });
    } catch (e) { logger.error(e); return res.status(500).json({ error: 'Failed to list buckets' }); }
  }

  async function createBucket(req, res) {
    try {
      const parsed = BucketSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      const data = parsed.data;
      if (data.effective_from && data.effective_to && data.effective_from > data.effective_to) {
        return res.status(400).json({ error: 'effective_from must be <= effective_to' });
      }
      const bucket = await SessionAdjustmentBucket.create({
        brand_key: data.brand_key,
        lower_bound_sessions: data.lower_bound_sessions,
        upper_bound_sessions: data.upper_bound_sessions,
        offset_pct: data.offset_pct,
        active: data.active === undefined ? 1 : (data.active ? 1 : 0),
        priority: data.priority ?? 100,
        effective_from: data.effective_from || null,
        effective_to: data.effective_to || null,
        notes: data.notes || null
      }, {
        fields: ['brand_key','lower_bound_sessions','upper_bound_sessions','offset_pct','active','priority','effective_from','effective_to','notes']
      });
      await SessionAdjustmentAudit.create({
        brand_key: data.brand_key,
        bucket_id: bucket.id,
        action: 'CREATE',
        before_json: null,
        after_json: bucket.toJSON(),
        author_user_id: req.user.id
      });

      // Auto-apply if active
      if (Number(bucket.active) === 1) {
        try {
          let start = (req.body?.start || req.query?.start || '').toString();
          let end = (req.body?.end || req.query?.end || '').toString();
          const onlyThisBucket = ((req.body?.only_this_bucket || req.query?.only_this_bucket || '1').toString()) === '1';
          const brandCheck = requireBrandKey(bucket.brand_key);
          if (brandCheck.error) return res.status(400).json({ error: brandCheck.error });
          const brandConn = await getBrandConnection(brandCheck.cfg);
          if (!start || !end || start > end) {
            const row = await brandConn.sequelize.query('SELECT MIN(date) AS min_d, MAX(date) AS max_d FROM overall_summary', { type: QueryTypes.SELECT });
            const mm = Array.isArray(row) ? row[0] : row;
            if (mm?.min_d && mm?.max_d) { start = mm.min_d; end = mm.max_d; }
          }
          let autoApplied = 0;
          let matchedDays = 0;
          if (start && end && start <= end) {
            const allBuckets = await SessionAdjustmentBucket.findAll({ where: { brand_key: bucket.brand_key }, order: [['priority','ASC'], ['id','ASC']] });
            const buckets = onlyThisBucket ? allBuckets.filter(b => Number(b.id) === Number(bucket.id)) : allBuckets.filter(b => Number(b.active) === 1);
            const rows = await brandConn.sequelize.query(
              'SELECT date, total_sessions FROM overall_summary WHERE date >= ? AND date <= ? ORDER BY date',
              { type: QueryTypes.SELECT, replacements: [start, end] }
            );
            const updates = [];
            for (const r of rows) {
              const d = r.date;
              const rawSessions = Number(r.total_sessions || 0);
              const appliedList = [];
              for (const b of buckets) {
                const efFromOk = !b.effective_from || d >= b.effective_from;
                const efToOk = !b.effective_to || d <= b.effective_to;
                if (!efFromOk || !efToOk) continue;
                if (rawSessions >= b.lower_bound_sessions && rawSessions <= b.upper_bound_sessions) appliedList.push(b);
              }
              if (appliedList.some(b => Number(b.id) === Number(bucket.id))) matchedDays += 1;
              const adjusted = appliedList.length ? Math.round(rawSessions * appliedList.reduce((f,b)=>f*(1+Number(b.offset_pct)/100),1)) : rawSessions;
              updates.push({ date: d, adjusted });
            }
            if (updates.length) {
              const caseParts = updates.map(u => `WHEN date='${u.date}' THEN ${u.adjusted}`);
              const sql = `UPDATE overall_summary SET adjusted_total_sessions = CASE ${caseParts.join(' ')} END WHERE date BETWEEN ? AND ?`;
              await brandConn.sequelize.query(sql, { type: QueryTypes.UPDATE, replacements: [start, end] });
              autoApplied = updates.length;
            }
            await SessionAdjustmentAudit.create({
              brand_key: bucket.brand_key,
              bucket_id: bucket.id,
              action: 'UPDATE',
              before_json: null,
              after_json: { auto_apply_after_creation: true, range: { start, end }, rows: autoApplied, matches: matchedDays, only_this_bucket: onlyThisBucket },
              author_user_id: req.user.id
            });
          }
          return res.status(201).json({ bucket, auto_applied_rows: autoApplied, auto_applied_matches: matchedDays });
        } catch (applyErr) {
          logger.error('[bucket-create] auto-apply failed', applyErr);
          return res.status(201).json({ bucket, auto_applied_rows: 0, auto_applied_matches: 0, warning: 'Auto-apply failed' });
        }
      }
      return res.status(201).json({ bucket, auto_applied_rows: 0, auto_applied_matches: 0 });
    } catch (e) { logger.error(e); return res.status(500).json({ error: 'Failed to create bucket' }); }
  }

  async function updateBucket(req, res) {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: 'Invalid id' });
      const existing = await SessionAdjustmentBucket.findByPk(id);
      if (!existing) return res.status(404).json({ error: 'Not found' });
      const brandKey = (req.body?.brand_key || req.query?.brand_key || '').toString().toUpperCase();
      if (!brandKey) return res.status(400).json({ error: 'brand_key required' });
      if (existing.brand_key !== brandKey) return res.status(403).json({ error: 'Bucket does not belong to brand_key' });
      const parsed = BucketSchema.omit({ brand_key: true }).partial().safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      const before = existing.toJSON();
      const data = parsed.data;
      if (data.effective_from && data.effective_to && data.effective_from > data.effective_to) {
        return res.status(400).json({ error: 'effective_from must be <= effective_to' });
      }
      Object.assign(existing, {
        lower_bound_sessions: data.lower_bound_sessions ?? existing.lower_bound_sessions,
        upper_bound_sessions: data.upper_bound_sessions ?? existing.upper_bound_sessions,
        offset_pct: data.offset_pct ?? existing.offset_pct,
        active: data.active === undefined ? existing.active : (data.active ? 1 : 0),
        priority: data.priority ?? existing.priority,
        effective_from: data.effective_from === undefined ? existing.effective_from : data.effective_from,
        effective_to: data.effective_to === undefined ? existing.effective_to : data.effective_to,
        notes: data.notes === undefined ? existing.notes : data.notes
      });
      await existing.save();
      await SessionAdjustmentAudit.create({
        brand_key: brandKey,
        bucket_id: existing.id,
        action: 'UPDATE',
        before_json: before,
        after_json: existing.toJSON(),
        author_user_id: req.user.id
      });
      return res.json({ bucket: existing });
    } catch (e) { logger.error(e); return res.status(500).json({ error: 'Failed to update bucket' }); }
  }

  async function deactivateBucket(req, res) {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: 'Invalid id' });
      const existing = await SessionAdjustmentBucket.findByPk(id);
      if (!existing) return res.status(404).json({ error: 'Not found' });
      const brandKey = (req.query?.brand_key || '').toString().toUpperCase();
      if (!brandKey) return res.status(400).json({ error: 'brand_key required' });
      if (existing.brand_key !== brandKey) return res.status(403).json({ error: 'Bucket does not belong to brand_key' });
      const before = existing.toJSON();
      existing.active = 0;
      await existing.save();
      await SessionAdjustmentAudit.create({
        brand_key: brandKey,
        bucket_id: existing.id,
        action: 'DEACTIVATE',
        before_json: before,
        after_json: existing.toJSON(),
        author_user_id: req.user.id
      });
      let start = (req.query.start || '').toString();
      let end = (req.query.end || '').toString();
      const scope = (req.query.scope || '').toString();

      if ((!start || !end || start > end) && (scope === 'bucket-window')) {
        start = existing.effective_from || '';
        end = existing.effective_to || '';
      }
      let recomputedRows = 0;
      let matchedDays = 0;
      if (start && end && start <= end) {
        const brandCheck = requireBrandKey(brandKey);
        if (brandCheck.error) return res.status(400).json({ error: brandCheck.error });
        const brandConn = await getBrandConnection(brandCheck.cfg);
        const remainingBuckets = await SessionAdjustmentBucket.findAll({ where: { brand_key: brandKey, active: 1 }, order: [['priority','ASC'], ['id','ASC']] });
        const rows = await brandConn.sequelize.query(
          'SELECT date, total_sessions FROM overall_summary WHERE date >= ? AND date <= ? ORDER BY date',
          { type: QueryTypes.SELECT, replacements: [start, end] }
        );
        const updates = [];
        for (const r of rows) {
          const d = r.date;
          const rawSessions = Number(r.total_sessions || 0);
          const efFromOkX = !existing.effective_from || d >= existing.effective_from;
          const efToOkX = !existing.effective_to || d <= existing.effective_to;
          if (efFromOkX && efToOkX && rawSessions >= existing.lower_bound_sessions && rawSessions <= existing.upper_bound_sessions) {
            matchedDays += 1;
          }
          const appliedList = [];
          for (const b of remainingBuckets) {
            const efFromOk = !b.effective_from || d >= b.effective_from;
            const efToOk = !b.effective_to || d <= b.effective_to;
            if (!efFromOk || !efToOk) continue;
            if (rawSessions >= b.lower_bound_sessions && rawSessions <= b.upper_bound_sessions) appliedList.push(b);
          }
          const adjusted = appliedList.length ? Math.round(rawSessions * appliedList.reduce((f,b)=>f*(1+Number(b.offset_pct)/100),1)) : rawSessions;
          updates.push({ date: d, adjusted });
        }
        if (updates.length) {
          const caseParts = updates.map(u => `WHEN date='${u.date}' THEN ${u.adjusted}`);
          const sql = `UPDATE overall_summary SET adjusted_total_sessions = CASE ${caseParts.join(' ')} END WHERE date BETWEEN ? AND ?`;
          await brandConn.sequelize.query(sql, { type: QueryTypes.UPDATE, replacements: [start, end] });
          recomputedRows = updates.length;
        }
        await SessionAdjustmentAudit.create({
          brand_key: brandKey,
          bucket_id: existing.id,
          action: 'UPDATE',
          before_json: null,
          after_json: { auto_recompute_after_deactivation: true, range: { start, end }, rows: recomputedRows, matches: matchedDays },
          author_user_id: req.user.id
        });
      }

      if ((!recomputedRows) && scope === 'all') {
        const brandCheck = requireBrandKey(brandKey);
        if (brandCheck.error) return res.status(400).json({ error: brandCheck.error });
        const brandConn = await getBrandConnection(brandCheck.cfg);
        const [minMax] = await brandConn.sequelize.query(
          'SELECT MIN(date) AS min_d, MAX(date) AS max_d FROM overall_summary',
          { type: QueryTypes.SELECT }
        );
        if (minMax?.min_d && minMax?.max_d) {
          const remainingBuckets = await SessionAdjustmentBucket.findAll({ where: { brand_key: brandKey, active: 1 }, order: [['priority','ASC'], ['id','ASC']] });
          const rows = await brandConn.sequelize.query(
            'SELECT date, total_sessions FROM overall_summary WHERE date >= ? AND date <= ? ORDER BY date',
            { type: QueryTypes.SELECT, replacements: [minMax.min_d, minMax.max_d] }
          );
          const updates = [];
          for (const r of rows) {
            const d = r.date;
            const rawSessions = Number(r.total_sessions || 0);
            const efFromOkX = !existing.effective_from || d >= existing.effective_from;
            const efToOkX = !existing.effective_to || d <= existing.effective_to;
            if (efFromOkX && efToOkX && rawSessions >= existing.lower_bound_sessions && rawSessions <= existing.upper_bound_sessions) {
              matchedDays += 1;
            }
            const appliedList = [];
            for (const b of remainingBuckets) {
              const efFromOk = !b.effective_from || d >= b.effective_from;
              const efToOk = !b.effective_to || d <= b.effective_to;
              if (!efFromOk || !efToOk) continue;
              if (rawSessions >= b.lower_bound_sessions && rawSessions <= b.upper_bound_sessions) appliedList.push(b);
            }
            const adjusted = appliedList.length ? Math.round(rawSessions * appliedList.reduce((f,b)=>f*(1+Number(b.offset_pct)/100),1)) : rawSessions;
            updates.push({ date: d, adjusted });
          }
          if (updates.length) {
            const caseParts = updates.map(u => `WHEN date='${u.date}' THEN ${u.adjusted}`);
            const sql = `UPDATE overall_summary SET adjusted_total_sessions = CASE ${caseParts.join(' ')} END WHERE date BETWEEN ? AND ?`;
            await brandConn.sequelize.query(sql, { type: QueryTypes.UPDATE, replacements: [minMax.min_d, minMax.max_d] });
            recomputedRows = updates.length;
          }
        }
      }
      return res.json({ deactivated: true, recomputed_rows: recomputedRows, recomputed_matches: matchedDays, scope_used: scope || (start && end ? 'range' : null) });
    } catch (e) { logger.error(e); return res.status(500).json({ error: 'Failed to deactivate bucket' }); }
  }

  async function activateBucket(req, res) {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: 'Invalid id' });
      const existing = await SessionAdjustmentBucket.findByPk(id);
      if (!existing) return res.status(404).json({ error: 'Not found' });
      const brandKey = (req.query?.brand_key || req.body?.brand_key || '').toString().toUpperCase();
      if (!brandKey) return res.status(400).json({ error: 'brand_key required' });
      if (existing.brand_key !== brandKey) return res.status(403).json({ error: 'Bucket does not belong to brand_key' });
      const before = existing.toJSON();
      existing.active = 1;
      await existing.save();
      await SessionAdjustmentAudit.create({
        brand_key: brandKey,
        bucket_id: existing.id,
        action: 'UPDATE',
        before_json: before,
        after_json: existing.toJSON(),
        author_user_id: req.user.id
      });
      let start = (req.query.start || req.body?.start || '').toString();
      let end = (req.query.end || req.body?.end || '').toString();
      const onlyThisBucket = (req.query.only_this_bucket || req.body?.only_this_bucket || '') === '1';
      let applied = 0;
      let matchedDays = 0;
      const brandCheck = requireBrandKey(brandKey);
      if (brandCheck.error) return res.status(400).json({ error: brandCheck.error });
      const brandConn = await getBrandConnection(brandCheck.cfg);
      if (!start || !end || start > end) {
        const row = await brandConn.sequelize.query('SELECT MIN(date) AS min_d, MAX(date) AS max_d FROM overall_summary', { type: QueryTypes.SELECT });
        const mm = Array.isArray(row) ? row[0] : row;
        if (mm?.min_d && mm?.max_d) { start = mm.min_d; end = mm.max_d; }
      }
      if (start && end && start <= end) {
        const allBuckets = await SessionAdjustmentBucket.findAll({ where: { brand_key: brandKey }, order: [['priority','ASC'], ['id','ASC']] });
        const buckets = onlyThisBucket ? allBuckets.filter(b => b.id === existing.id) : allBuckets.filter(b => Number(b.active) === 1);
        const rows = await brandConn.sequelize.query(
          'SELECT date, total_sessions FROM overall_summary WHERE date >= ? AND date <= ? ORDER BY date',
          { type: QueryTypes.SELECT, replacements: [start, end] }
        );
        const updates = [];
        for (const r of rows) {
          const d = r.date;
          const rawSessions = Number(r.total_sessions || 0);
          const appliedList = [];
          for (const b of buckets) {
            const efFromOk = !b.effective_from || d >= b.effective_from;
            const efToOk = !b.effective_to || d <= b.effective_to;
            if (!efFromOk || !efToOk) continue;
            if (rawSessions >= b.lower_bound_sessions && rawSessions <= b.upper_bound_sessions) appliedList.push(b);
          }
          if (appliedList.some(b => Number(b.id) === Number(existing.id))) matchedDays += 1;
          const adjusted = appliedList.length ? Math.round(rawSessions * appliedList.reduce((f,b)=>f*(1+Number(b.offset_pct)/100),1)) : rawSessions;
          updates.push({ date: d, adjusted });
        }
        if (updates.length) {
          const caseParts = updates.map(u => `WHEN date='${u.date}' THEN ${u.adjusted}`);
          const sql = `UPDATE overall_summary SET adjusted_total_sessions = CASE ${caseParts.join(' ')} END WHERE date BETWEEN ? AND ?`;
          await brandConn.sequelize.query(sql, { type: QueryTypes.UPDATE, replacements: [start, end] });
          applied = updates.length;
        }
        await SessionAdjustmentAudit.create({
          brand_key: brandKey,
          bucket_id: existing.id,
          action: 'UPDATE',
          before_json: null,
          after_json: { auto_apply_after_activation: true, range: { start, end }, rows: applied, matches: matchedDays, only_this_bucket: onlyThisBucket },
          author_user_id: req.user.id
        });
      }
      return res.json({ bucket: existing, auto_applied_rows: applied, auto_applied_matches: matchedDays });
    } catch (e) { logger.error(e); return res.status(500).json({ error: 'Failed to activate bucket' }); }
  }

  return {
    listBuckets,
    createBucket,
    updateBucket,
    deactivateBucket,
    activateBucket,
    previewAdjustments: async (req, res) => {
      try {
        const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
        if (!parsed.success) return res.status(400).json({ error: 'Invalid range', details: parsed.error.flatten() });
        const { start, end } = parsed.data;
        if (!start || !end) return res.status(400).json({ error: 'start and end required' });
        if (start > end) return res.status(400).json({ error: 'start must be <= end' });
        const brandCheck = requireBrandKey(req.query.brand_key);
        if (brandCheck.error) return res.status(400).json({ error: brandCheck.error });

        const idsParam = (req.query.bucket_ids || '').toString().trim();
        const selectedIds = idsParam ? idsParam.split(',').map(s=>Number(s)).filter(n=>Number.isInteger(n) && n>0) : [];

        const allBuckets = await SessionAdjustmentBucket.findAll({ where: { brand_key: brandCheck.key }, order: [['priority','ASC'], ['id','ASC']] });
        const buckets = selectedIds.length
          ? allBuckets.filter(b => selectedIds.includes(Number(b.id)))
          : allBuckets.filter(b => Number(b.active) === 1);

        const brandConn = await getBrandConnection(brandCheck.cfg);

        const days = [];
        const DAY_MS = 86400000;
        const startTs = Date.parse(`${start}T00:00:00Z`);
        const endTs = Date.parse(`${end}T00:00:00Z`);
        for (let t = startTs; t <= endTs; t += DAY_MS) {
          const d = new Date(t);
          const iso = d.toISOString().slice(0,10);
          days.push(iso);
        }

        const rows = await brandConn.sequelize.query(
          'SELECT date, total_sessions, adjusted_total_sessions FROM overall_summary WHERE date >= ? AND date <= ? ORDER BY date',
          { type: QueryTypes.SELECT, replacements: [start, end] }
        );
        const rowMap = new Map(rows.map(r => [r.date, r]));

        const resultDays = [];
        for (const d of days) {
          const r = rowMap.get(d) || { total_sessions: 0, adjusted_total_sessions: null };
          const rawSessions = Number(r.total_sessions || 0);
          const appliedList = [];
          for (const b of buckets) {
            const efFromOk = !b.effective_from || d >= b.effective_from;
            const efToOk = !b.effective_to || d <= b.effective_to;
            if (!efFromOk || !efToOk) continue;
            if (rawSessions >= b.lower_bound_sessions && rawSessions <= b.upper_bound_sessions) {
              appliedList.push(b);
            }
          }
          let adjusted = rawSessions;
          if (appliedList.length) {
            let factor = 1;
            for (const b of appliedList) factor *= (1 + Number(b.offset_pct) / 100);
            adjusted = Math.round(rawSessions * factor);
          }
          const delta = adjusted - rawSessions;
          const deltaPct = rawSessions > 0 ? (delta / rawSessions) * 100 : (adjusted > 0 ? 100 : 0);
          const appliedIds = appliedList.map(b => b.id);
          const combinedPct = appliedList.length ? ((appliedList.reduce((acc,b)=>acc*(1+Number(b.offset_pct)/100),1) - 1) * 100) : 0;
          resultDays.push({ 
            date: d,
            raw_sessions: rawSessions,
            preview_adjusted_sessions: adjusted,
            buckets_applied: appliedIds,
            combined_offset_pct: appliedList.length ? combinedPct : null,
            delta,
            delta_pct: deltaPct
          });
        }

        const totalRaw = resultDays.reduce((a,b) => a + b.raw_sessions, 0);
        const totalAdj = resultDays.reduce((a,b) => a + b.preview_adjusted_sessions, 0);
        const totalDelta = totalAdj - totalRaw;
        const totalDeltaPct = totalRaw > 0 ? (totalDelta / totalRaw) * 100 : (totalAdj > 0 ? 100 : 0);

        return res.json({ range: { start, end }, days: resultDays, totals: { raw: totalRaw, adjusted: totalAdj, delta: totalDelta, delta_pct: totalDeltaPct }, buckets: allBuckets, selected_bucket_ids: selectedIds });
      } catch (e) { logger.error(e); return res.status(500).json({ error: 'Preview failed' }); }
    },

    applyAdjustments: async (req, res) => {
      try {
        const parsed = RangeSchema.safeParse({ start: req.body.start, end: req.body.end });
        if (!parsed.success) return res.status(400).json({ error: 'Invalid range', details: parsed.error.flatten() });
        const { start, end } = parsed.data;
        if (!start || !end) return res.status(400).json({ error: 'start and end required' });
        if (start > end) return res.status(400).json({ error: 'start must be <= end' });
        const brandCheck = requireBrandKey(req.body.brand_key);
        if (brandCheck.error) return res.status(400).json({ error: brandCheck.error });
        const brandConn = await getBrandConnection(brandCheck.cfg);

        const rawIds = req.body?.bucket_ids;
        let selectedIds = Array.isArray(rawIds) ? rawIds.map(n=>Number(n)).filter(n=>Number.isInteger(n)&&n>0) : [];
        const allBuckets = await SessionAdjustmentBucket.findAll({ where: { brand_key: brandCheck.key }, order: [['priority','ASC'], ['id','ASC']] });
        const buckets = selectedIds.length
          ? allBuckets.filter(b => selectedIds.includes(Number(b.id)))
          : allBuckets.filter(b => Number(b.active) === 1);
        const rows = await brandConn.sequelize.query(
          'SELECT date, total_sessions FROM overall_summary WHERE date >= ? AND date <= ? ORDER BY date',
          { type: QueryTypes.SELECT, replacements: [start, end] }
        );
        const updates = [];
        for (const r of rows) {
          const d = r.date;
          const rawSessions = Number(r.total_sessions || 0);
          const appliedList = [];
          for (const b of buckets) {
            const efFromOk = !b.effective_from || d >= b.effective_from;
            const efToOk = !b.effective_to || d <= b.effective_to;
            if (!efFromOk || !efToOk) continue;
            if (rawSessions >= b.lower_bound_sessions && rawSessions <= b.upper_bound_sessions) { appliedList.push(b); }
          }
          const adjusted = appliedList.length ? Math.round(rawSessions * appliedList.reduce((f,b)=>f*(1+Number(b.offset_pct)/100),1)) : rawSessions;
          updates.push({ date: d, adjusted });
        }
        if (updates.length) {
          const caseParts = updates.map(u => `WHEN date='${u.date}' THEN ${u.adjusted}`);
          const sql = `UPDATE overall_summary SET adjusted_total_sessions = CASE ${caseParts.join(' ')} END WHERE date BETWEEN ? AND ?`;
          await brandConn.sequelize.query(sql, { type: QueryTypes.UPDATE, replacements: [start, end] });
        }
        await SessionAdjustmentAudit.create({
          brand_key: brandCheck.key,
          bucket_id: 0,
          action: 'UPDATE',
          before_json: null,
          after_json: { applied_range: { start, end }, rows: updates.length, selected_bucket_ids: selectedIds.length ? selectedIds : 'active-only' },
          author_user_id: req.user.id
        });
        return res.json({ applied: updates.length, range: { start, end } });
      } catch (e) { logger.error(e); return res.status(500).json({ error: 'Apply failed' }); }
    },
  };
}

module.exports = { buildAdjustmentBucketsController };
