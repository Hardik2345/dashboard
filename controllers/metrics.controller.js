// Metrics controller (Phase 2): implement totals first
const { z } = require('zod');
const { QueryTypes } = require('sequelize');
const {
  computeTotalSales,
  computeTotalOrders,
  computeFunnelStats,
  computeAOV,
  computeCVR,
} = require('../lib/metrics.service');

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const RangeSchema = z.object({ start: isoDate.optional(), end: isoDate.optional() });

const MetricsController = {
  async totalSales(req, res) {
    try {
      const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
      if (!parsed.success) return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
      const { start, end } = parsed.data;
      const total_sales = await computeTotalSales({ start, end, conn: req.brandDb.sequelize });
      return res.json({ metric: 'TOTAL_SALES', range: { start: start || null, end: end || null }, total_sales });
    } catch (err) {
      console.error('[metrics.totalSales] failed', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },
  async totalOrders(req, res) {
    try {
      const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
      if (!parsed.success) return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
      const { start, end } = parsed.data;
      const total_orders = await computeTotalOrders({ start, end, conn: req.brandDb.sequelize });
      return res.json({ metric: 'TOTAL_ORDERS', range: { start: start || null, end: end || null }, total_orders });
    } catch (err) {
      console.error('[metrics.totalOrders] failed', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },
  async funnelStats(req, res) {
    try {
      const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
      if (!parsed.success) return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
      const { start, end } = parsed.data;
      const stats = await computeFunnelStats({ start, end, conn: req.brandDb.sequelize });
      return res.json({
        metric: 'FUNNEL_STATS',
        range: { start: start || null, end: end || null },
        total_sessions: stats.total_sessions,
        total_atc_sessions: stats.total_atc_sessions,
        total_orders: stats.total_orders,
      });
    } catch (err) {
      console.error('[metrics.funnelStats] failed', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },
  async aov(req, res) {
    try {
      const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
      if (!parsed.success) return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
      const { start, end } = parsed.data;
      const result = await computeAOV({ start, end, conn: req.brandDb.sequelize });
      return res.json({
        metric: 'AOV',
        range: { start: start || null, end: end || null },
        total_sales: result.total_sales,
        total_orders: result.total_orders,
        aov: result.aov,
      });
    } catch (err) {
      console.error('[metrics.aov] failed', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },
  async cvr(req, res) {
    try {
      const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
      if (!parsed.success) return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
      const { start, end } = parsed.data;
      const result = await computeCVR({ start, end, conn: req.brandDb.sequelize });
      return res.json({
        metric: 'CVR',
        range: { start: start || null, end: end || null },
        total_orders: result.total_orders,
        total_sessions: result.total_sessions,
        cvr: result.cvr,
        cvr_percent: result.cvr_percent,
      });
    } catch (err) {
      console.error('[metrics.cvr] failed', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },
  async totalSalesDelta(req, res) {
    try {
      const { previousWindow, istNowInfo, alignedSalesForRange, alignedSalesForDay, deltaForSum } = require('../lib/metrics.delta.service');
      const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
      const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
      if (!parsed.success) return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
      const { start, end } = parsed.data;
      const date = parsed.data.end || parsed.data.start;
      if (!date && !(start && end)) return res.json({ metric: 'TOTAL_SALES_DELTA', date: null, current: null, previous: null, diff_pct: 0, direction: 'flat' });

      const { previousWindow: prevWindowFn } = require('../lib/metrics.delta.service');
      const { rawSum } = require('../lib/metrics.service');
      const avgForRange = async (column, { start, end, conn }) => {
        if (!start || !end) return 0;
        const daysInclusive = (s, e) => {
          const ds = new Date(`${s}T00:00:00Z`).getTime();
          const de = new Date(`${e}T00:00:00Z`).getTime();
          return Math.floor((de - ds) / 86400000) + 1;
        };
        const n = daysInclusive(start, end);
        if (n <= 0) return 0;
        const total = await rawSum(column, { start, end, conn });
        return total / n;
      };

      const compare = (req.query.compare || '').toString().toLowerCase();
      if (compare === 'prev-range-avg' && start && end) {
        const currAvg = await avgForRange('total_sales', { start, end, conn: req.brandDb.sequelize });
        const prevWin = prevWindowFn(start, end);
        const prevAvg = await avgForRange('total_sales', { start: prevWin.prevStart, end: prevWin.prevEnd, conn: req.brandDb.sequelize });
        const diff = currAvg - prevAvg;
        const diff_pct = prevAvg > 0 ? (diff / prevAvg) * 100 : (currAvg > 0 ? 100 : 0);
        const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
        return res.json({ metric: 'TOTAL_SALES_DELTA', range: { start, end }, current: currAvg, previous: prevAvg, diff_pct, direction, compare: 'prev-range-avg' });
      }

      const align = (req.query.align || '').toString().toLowerCase();
      if (align === 'hour') {
        const { todayIst, currentHourIst } = istNowInfo();
        const resolveTargetHour = (endOrDate) => (endOrDate === todayIst ? currentHourIst : 23);
        const conn = req.brandDb.sequelize;
        if (start && end) {
          const targetHour = resolveTargetHour(end);
          const prevWin = previousWindow(start, end);
          const [curr, prevVal] = await Promise.all([
            alignedSalesForRange({ start, end, conn, targetHour }),
            alignedSalesForRange({ start: prevWin.prevStart, end: prevWin.prevEnd, conn, targetHour }),
          ]);
          const diff = curr - prevVal;
          const diff_pct = prevVal > 0 ? (diff / prevVal) * 100 : (curr > 0 ? 100 : 0);
          const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
          return res.json({ metric: 'TOTAL_SALES_DELTA', range: { start, end }, current: curr, previous: prevVal, diff_pct, direction, align: 'hour', hour: targetHour });
        } else {
          const targetHour = resolveTargetHour(date);
          const { prevDayStr } = require('../lib/metrics.delta.service');
          const prev = prevDayStr(date);
          const [curr, prevVal] = await Promise.all([
            alignedSalesForDay({ date, conn, targetHour }),
            alignedSalesForDay({ date: prev, conn, targetHour }),
          ]);
          const diff = curr - prevVal;
          const diff_pct = prevVal > 0 ? (diff / prevVal) * 100 : (curr > 0 ? 100 : 0);
          const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
          return res.json({ metric: 'TOTAL_SALES_DELTA', date, current: curr, previous: prevVal, diff_pct, direction, align: 'hour', hour: targetHour });
        }
      }

      const d = await deltaForSum('total_sales', date, req.brandDb.sequelize);
      return res.json({ metric: 'TOTAL_SALES_DELTA', date, ...d });
    } catch (e) {
      console.error('[metrics.totalSalesDelta] failed', e);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },
  async totalSessionsDelta(req, res) {
    try {
      const { previousWindow, prevDayStr, istNowInfo, alignedSessionsForRange, alignedSessionsForDay, deltaForSum } = require('../lib/metrics.delta.service');
      const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
      if (!parsed.success) return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
      const { start, end } = parsed.data;
      const date = end || start;
      if (!date && !(start && end)) return res.json({ metric: 'TOTAL_SESSIONS_DELTA', date: null, current: null, previous: null, diff_pct: 0, direction: 'flat' });
      const { rawSum } = require('../lib/metrics.service');
      const avgForRange = async (column, { start, end, conn }) => {
        if (!start || !end) return 0;
        const daysInclusive = (s, e) => { const ds = new Date(`${s}T00:00:00Z`).getTime(); const de = new Date(`${e}T00:00:00Z`).getTime(); return Math.floor((de - ds) / 86400000) + 1; };
        const n = daysInclusive(start, end); if (n <= 0) return 0; const total = await rawSum(column, { start, end, conn }); return total / n;
      };
      const compare = (req.query.compare || '').toString().toLowerCase();
      if (compare === 'prev-range-avg' && start && end) {
        const currAvg = await avgForRange('total_sessions', { start, end, conn: req.brandDb.sequelize });
        const prevWin = previousWindow(start, end);
        const prevAvg = await avgForRange('total_sessions', { start: prevWin.prevStart, end: prevWin.prevEnd, conn: req.brandDb.sequelize });
        const diff = currAvg - prevAvg; const diff_pct = prevAvg > 0 ? (diff / prevAvg) * 100 : (currAvg > 0 ? 100 : 0);
        const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
        return res.json({ metric: 'TOTAL_SESSIONS_DELTA', range: { start, end }, current: currAvg, previous: prevAvg, diff_pct, direction, compare: 'prev-range-avg' });
      }
      const align = (req.query.align || '').toString().toLowerCase();
      if (align === 'hour') {
        const { todayIst, currentHourIst } = istNowInfo();
        const resolveTargetHour = (endOrDate) => (endOrDate === todayIst ? currentHourIst : 23);
        const conn = req.brandDb.sequelize;
        if (start && end) {
          const targetHour = resolveTargetHour(end);
          const prevWin = previousWindow(start, end);
          const [curr, prevVal] = await Promise.all([
            alignedSessionsForRange({ start, end, conn, targetHour }),
            alignedSessionsForRange({ start: prevWin.prevStart, end: prevWin.prevEnd, conn, targetHour }),
          ]);
          const diff = curr - prevVal; const diff_pct = prevVal > 0 ? (diff / prevVal) * 100 : (curr > 0 ? 100 : 0);
          const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
          return res.json({ metric: 'TOTAL_SESSIONS_DELTA', range: { start, end }, current: curr, previous: prevVal, diff_pct, direction, align: 'hour', hour: targetHour });
        } else {
          const targetHour = resolveTargetHour(date);
          const prev = prevDayStr(date);
          const [curr, prevVal] = await Promise.all([
            alignedSessionsForDay({ date, conn, targetHour }),
            alignedSessionsForDay({ date: prev, conn, targetHour }),
          ]);
          const diff = curr - prevVal; const diff_pct = prevVal > 0 ? (diff / prevVal) * 100 : (curr > 0 ? 100 : 0);
          const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
          return res.json({ metric: 'TOTAL_SESSIONS_DELTA', date, current: curr, previous: prevVal, diff_pct, direction, align: 'hour', hour: targetHour });
        }
      }
      const d = await deltaForSum('total_sessions', date, req.brandDb.sequelize);
      return res.json({ metric: 'TOTAL_SESSIONS_DELTA', date, ...d });
    } catch (e) { console.error('[metrics.totalSessionsDelta] failed', e); return res.status(500).json({ error: 'Internal server error' }); }
  },
  async atcSessionsDelta(req, res) {
    try {
      const { previousWindow, prevDayStr, istNowInfo, alignedATCForRange, alignedATCForDay, deltaForSum } = require('../lib/metrics.delta.service');
      const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
      if (!parsed.success) return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
      const { start, end } = parsed.data; const date = end || start;
      if (!date && !(start && end)) return res.json({ metric: 'ATC_SESSIONS_DELTA', date: null, current: null, previous: null, diff_pct: 0, direction: 'flat' });
      const { rawSum } = require('../lib/metrics.service');
      const avgForRange = async (column, { start, end, conn }) => { if (!start || !end) return 0; const ds=(s,e)=>{const a=new Date(`${s}T00:00:00Z`).getTime();const b=new Date(`${e}T00:00:00Z`).getTime();return Math.floor((b-a)/86400000)+1;}; const n=ds(start,end); if(n<=0) return 0; const total=await rawSum(column,{start,end,conn}); return total/n; };
      const compare = (req.query.compare || '').toString().toLowerCase();
      if (compare === 'prev-range-avg' && start && end) {
        const currAvg = await avgForRange('total_atc_sessions', { start, end, conn: req.brandDb.sequelize });
        const prevWin = previousWindow(start, end);
        const prevAvg = await avgForRange('total_atc_sessions', { start: prevWin.prevStart, end: prevWin.prevEnd, conn: req.brandDb.sequelize });
        const diff = currAvg - prevAvg; const diff_pct = prevAvg > 0 ? (diff / prevAvg) * 100 : (currAvg > 0 ? 100 : 0);
        const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
        return res.json({ metric: 'ATC_SESSIONS_DELTA', range: { start, end }, current: currAvg, previous: prevAvg, diff_pct, direction, compare: 'prev-range-avg' });
      }
      const align = (req.query.align || '').toString().toLowerCase();
      if (align === 'hour') {
        const { todayIst, currentHourIst } = istNowInfo();
        const resolveTargetHour = (endOrDate) => (endOrDate === todayIst ? currentHourIst : 23);
        const conn = req.brandDb.sequelize;
        if (start && end) {
          const targetHour = resolveTargetHour(end);
          const prevWin = previousWindow(start, end);
          const [curr, prevVal] = await Promise.all([
            alignedATCForRange({ start, end, conn, targetHour }),
            alignedATCForRange({ start: prevWin.prevStart, end: prevWin.prevEnd, conn, targetHour }),
          ]);
          const diff = curr - prevVal; const diff_pct = prevVal > 0 ? (diff / prevVal) * 100 : (curr > 0 ? 100 : 0);
          const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
          return res.json({ metric: 'ATC_SESSIONS_DELTA', range: { start, end }, current: curr, previous: prevVal, diff_pct, direction, align: 'hour', hour: targetHour });
        } else {
          const targetHour = resolveTargetHour(date);
          const prev = prevDayStr(date);
          const [curr, prevVal] = await Promise.all([
            alignedATCForDay({ date, conn, targetHour }),
            alignedATCForDay({ date: prev, conn, targetHour }),
          ]);
          const diff = curr - prevVal; const diff_pct = prevVal > 0 ? (diff / prevVal) * 100 : (curr > 0 ? 100 : 0);
          const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
          return res.json({ metric: 'ATC_SESSIONS_DELTA', date, current: curr, previous: prevVal, diff_pct, direction, align: 'hour', hour: targetHour });
        }
      }
      const d = await deltaForSum('total_atc_sessions', date, req.brandDb.sequelize);
      return res.json({ metric: 'ATC_SESSIONS_DELTA', date, ...d });
    } catch (e) { console.error('[metrics.atcSessionsDelta] failed', e); return res.status(500).json({ error: 'Internal server error' }); }
  },
  async aovDelta(req, res) {
    try {
      const { previousWindow, deltaForAOV, aovForRange } = require('../lib/metrics.delta.service');
      const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
      if (!parsed.success) return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
      const { start, end } = parsed.data; const date = end || start;
      if (!date && !(start && end)) return res.json({ metric: 'AOV_DELTA', date: null, current: null, previous: null, diff_pct: 0, direction: 'flat' });
      const compare = (req.query.compare || '').toString().toLowerCase();
      if (compare === 'prev-range-avg' && start && end) {
        const curr = await aovForRange({ start, end, conn: req.brandDb.sequelize });
        const prevWin = previousWindow(start, end);
        const prev = await aovForRange({ start: prevWin.prevStart, end: prevWin.prevEnd, conn: req.brandDb.sequelize });
        const diff = curr - prev; const diff_pct = prev > 0 ? (diff / prev) * 100 : (curr > 0 ? 100 : 0);
        const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
        return res.json({ metric: 'AOV_DELTA', range: { start, end }, current: curr, previous: prev, diff_pct, direction, compare: 'prev-range-avg' });
      }
      const d = await deltaForAOV(date, req.brandDb.sequelize);
      return res.json({ metric: 'AOV_DELTA', date, ...d });
    } catch (e) { console.error('[metrics.aovDelta] failed', e); return res.status(500).json({ error: 'Internal server error' }); }
  },
  async cvrDelta(req, res) {
    try {
      const { previousWindow, istNowInfo, alignedOrdersForRange, alignedOrdersForDay } = require('../lib/metrics.delta.service');
      const { computeCVR } = require('../lib/metrics.service');
      const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
      if (!parsed.success) return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
      const { start, end } = parsed.data; const target = end || start;
      if (!target) {
        return res.json({ metric: 'CVR_DELTA', date: null, current: null, previous: null, diff_pp: 0, direction: 'flat' });
      }
      const compare = (req.query.compare || '').toString().toLowerCase();
      if (compare === 'prev-range-avg' && start && end) {
        const curr = await (async () => {
          const r = await computeCVR({ start, end, conn: req.brandDb.sequelize });
          return { cvr_percent: r.cvr_percent };
        })();
        const prevWin = previousWindow(start, end);
        const prev = await (async () => {
          const r = await computeCVR({ start: prevWin.prevStart, end: prevWin.prevEnd, conn: req.brandDb.sequelize });
          return { cvr_percent: r.cvr_percent };
        })();
        const diff_pp = (curr.cvr_percent || 0) - (prev.cvr_percent || 0);
        const direction = diff_pp > 0.0001 ? 'up' : diff_pp < -0.0001 ? 'down' : 'flat';
        return res.json({ metric: 'CVR_DELTA', range: { start, end }, current: curr, previous: prev, diff_pp, direction, compare: 'prev-range-avg' });
      }
      const align = (req.query.align || '').toString().toLowerCase();
      if (align === 'hour') {
        const { todayIst, currentHourIst, IST_OFFSET_MIN } = istNowInfo();
        const resolveTargetHour = (endOrDate) => (endOrDate === todayIst ? currentHourIst : 23);
        const conn = req.brandDb.sequelize;
        if (start && end) {
          const targetHour = resolveTargetHour(end);
          const prevWin = previousWindow(start, end);
          // Sessions cumulative across range
          const sqlSessRange = `SELECT COALESCE(SUM(number_of_sessions),0) AS total FROM hourly_sessions_summary WHERE date >= ? AND date <= ? AND hour <= ?`;
          const [sessCurRows, sessPrevRows] = await Promise.all([
            conn.query(sqlSessRange, { type: QueryTypes.SELECT, replacements: [start, end, targetHour] }),
            conn.query(sqlSessRange, { type: QueryTypes.SELECT, replacements: [prevWin.prevStart, prevWin.prevEnd, targetHour] }),
          ]);
          const curSessions = Number(sessCurRows?.[0]?.total || 0);
          const prevSessions = Number(sessPrevRows?.[0]?.total || 0);
          const [curOrders, prevOrders] = await Promise.all([
            alignedOrdersForRange({ start, end, conn, targetHour, IST_OFFSET_MIN }),
            alignedOrdersForRange({ start: prevWin.prevStart, end: prevWin.prevEnd, conn, targetHour, IST_OFFSET_MIN }),
          ]);
          const curCVR = curSessions > 0 ? (curOrders / curSessions) : 0;
          const prevCVR = prevSessions > 0 ? (prevOrders / prevSessions) : 0;
          const diff_pp = (curCVR - prevCVR) * 100;
          const direction = diff_pp > 0.0001 ? 'up' : diff_pp < -0.0001 ? 'down' : 'flat';
          return res.json({ metric: 'CVR_DELTA', range: { start, end }, current: { total_orders: curOrders, total_sessions: curSessions, cvr: curCVR, cvr_percent: curCVR * 100 }, previous: { total_orders: prevOrders, total_sessions: prevSessions, cvr: prevCVR, cvr_percent: prevCVR * 100 }, diff_pp, direction, align: 'hour', hour: targetHour });
        }
        const targetHour = resolveTargetHour(target);
        // Sessions cumulative single day
        const sqlSess = `SELECT COALESCE(SUM(number_of_sessions),0) AS total FROM hourly_sessions_summary WHERE date = ? AND hour <= ?`;
        const [sessCurRows, sessPrevRows] = await Promise.all([
          conn.query(sqlSess, { type: QueryTypes.SELECT, replacements: [target, targetHour] }),
          conn.query(sqlSess, { type: QueryTypes.SELECT, replacements: [require('../lib/metrics.delta.service').prevDayStr(target), targetHour] }),
        ]);
        const curSessions = Number(sessCurRows?.[0]?.total || 0);
        const prevSessions = Number(sessPrevRows?.[0]?.total || 0);
        const [curOrders, prevOrders] = await Promise.all([
          alignedOrdersForDay({ date: target, conn, targetHour, IST_OFFSET_MIN }),
          alignedOrdersForDay({ date: require('../lib/metrics.delta.service').prevDayStr(target), conn, targetHour, IST_OFFSET_MIN }),
        ]);
        const curCVR = curSessions > 0 ? (curOrders / curSessions) : 0;
        const prevCVR = prevSessions > 0 ? (prevOrders / prevSessions) : 0;
        const diff_pp = (curCVR - prevCVR) * 100;
        const direction = diff_pp > 0.0001 ? 'up' : diff_pp < -0.0001 ? 'down' : 'flat';
        return res.json({ metric: 'CVR_DELTA', date: target, current: { total_orders: curOrders, total_sessions: curSessions, cvr: curCVR, cvr_percent: curCVR * 100 }, previous: { total_orders: prevOrders, total_sessions: prevSessions, cvr: prevCVR, cvr_percent: prevCVR * 100 }, diff_pp, direction, align: 'hour', hour: targetHour });
      }
      // Default day-based comparison
      const { prevDayStr } = require('../lib/metrics.delta.service');
      const [current, previous] = await Promise.all([
        computeCVR({ start: target, end: target, conn: req.brandDb.sequelize }),
        computeCVR({ start: prevDayStr(target), end: prevDayStr(target), conn: req.brandDb.sequelize }),
      ]);
      const diff_pp = (current.cvr_percent || 0) - (previous.cvr_percent || 0);
      const direction = diff_pp > 0.0001 ? 'up' : diff_pp < -0.0001 ? 'down' : 'flat';
      return res.json({ metric: 'CVR_DELTA', date: target, current, previous, diff_pp, direction });
    } catch (e) { console.error('[metrics.cvrDelta] failed', e); return res.status(500).json({ error: 'Internal server error' }); }
  },
  async orderSplit(req, res) {
    try {
      const { z } = require('zod');
      const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
      const RangeSchema = z.object({ start: isoDate.optional(), end: isoDate.optional() });
      const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
      if (!parsed.success) return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
      const { start, end } = parsed.data;
      const { rawSum } = require('../lib/metrics.service');
      const [cod_orders, prepaid_orders] = await Promise.all([
        rawSum('cod_orders', { start, end, conn: req.brandDb.sequelize }),
        rawSum('prepaid_orders', { start, end, conn: req.brandDb.sequelize }),
      ]);
      const total = cod_orders + prepaid_orders;
      const cod_percent = total > 0 ? (cod_orders / total) * 100 : 0;
      const prepaid_percent = total > 0 ? (prepaid_orders / total) * 100 : 0;
      return res.json({ metric: 'ORDER_SPLIT', range: { start: start || null, end: end || null }, cod_orders, prepaid_orders, total_orders_from_split: total, cod_percent, prepaid_percent });
    } catch (e) { console.error('[metrics.orderSplit] failed', e); return res.status(500).json({ error: 'Internal server error' }); }
  },
  async paymentSalesSplit(req, res) {
    try {
      const { z } = require('zod');
      const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
      const RangeSchema = z.object({ start: isoDate.optional(), end: isoDate.optional() });
      const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
      if (!parsed.success) return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
      const { start, end } = parsed.data;
      if (!start && !end) {
        return res.json({ metric: 'PAYMENT_SPLIT_SALES', range: { start: null, end: null }, cod_sales: 0, prepaid_sales: 0, total_sales_from_split: 0, cod_percent: 0, prepaid_percent: 0 });
      }
      const effectiveStart = start || end; const effectiveEnd = end || start;
      const startTs = `${effectiveStart} 00:00:00`;
      const endTsExclusive = new Date(`${effectiveEnd}T00:00:00Z`); endTsExclusive.setUTCDate(endTsExclusive.getUTCDate() + 1);
      const endTs = endTsExclusive.toISOString().slice(0,19).replace('T',' ');
      const sql = `
        SELECT payment_type, SUM(max_price) AS sales
        FROM (
          SELECT 
            CASE 
              WHEN payment_gateway_names LIKE '%Cash on Delivery (COD)%' OR payment_gateway_names LIKE '%cash_on_delivery%' THEN 'COD'
              ELSE 'Prepaid'
            END AS payment_type,
            order_name,
            MAX(total_price) AS max_price
          FROM shopify_orders
          WHERE created_at >= ? AND created_at < ?
          GROUP BY payment_gateway_names, order_name
        ) sub
        GROUP BY payment_type`;
      let rows = [];
      try { rows = await req.brandDb.sequelize.query(sql, { type: QueryTypes.SELECT, replacements: [startTs, endTs] }); }
      catch (e) {
        console.error('[payment-sales-split] query failed', e.message);
        return res.json({ metric: 'PAYMENT_SPLIT_SALES', range: { start: effectiveStart, end: effectiveEnd }, cod_sales: 0, prepaid_sales: 0, total_sales_from_split: 0, cod_percent: 0, prepaid_percent: 0, warning: 'Query failed' });
      }
      let cod_sales = 0; let prepaid_sales = 0;
      for (const r of rows) { if (r.payment_type === 'COD') cod_sales = Number(r.sales || 0); else if (r.payment_type === 'Prepaid') prepaid_sales = Number(r.sales || 0); }
      const total = cod_sales + prepaid_sales;
      const cod_percent = total > 0 ? (cod_sales / total) * 100 : 0;
      const prepaid_percent = total > 0 ? (prepaid_sales / total) * 100 : 0;
      return res.json({ metric: 'PAYMENT_SPLIT_SALES', range: { start: effectiveStart, end: effectiveEnd }, cod_sales, prepaid_sales, total_sales_from_split: total, cod_percent, prepaid_percent, sql_used: process.env.NODE_ENV === 'production' ? undefined : sql });
    } catch (e) { console.error('[metrics.paymentSalesSplit] failed', e); return res.status(500).json({ error: 'Internal server error' }); }
  },
  async totalOrdersDelta(req, res) {
    try {
      const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
      if (!parsed.success) return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
      const { start, end } = parsed.data; const date = end || start;
      if (!date && !(start && end)) return res.json({ metric: 'TOTAL_ORDERS_DELTA', date: null, current: null, previous: null, diff_pct: 0, direction: 'flat' });
      const { deltaForSum } = require('../lib/metrics.delta.service');
      const delta = await deltaForSum('total_orders', date, req.brandDb.sequelize);
      return res.json({ metric: 'TOTAL_ORDERS_DELTA', date, ...delta });
    } catch (e) { console.error('[metrics.totalOrdersDelta] failed', e); return res.status(500).json({ error: 'Internal server error' }); }
  },
  async diagnoseTotalOrders(req, res) {
    try {
      const start = req.query.start; const end = req.query.end;
      const conn = req.brandDb?.sequelize;
      if (!conn) return res.status(500).json({ error: 'Brand connection unavailable' });
      const [envInfo] = await conn.query("SELECT DATABASE() AS db, @@hostname AS host, @@version AS version", { type: require('sequelize').QueryTypes.SELECT });
      const sqlTotal = "SELECT COALESCE(SUM(total_orders),0) AS total FROM overall_summary WHERE date >= ? AND date <= ?";
      const sqlDaily = "SELECT date, SUM(total_orders) AS total_orders FROM overall_summary WHERE date >= ? AND date <= ? GROUP BY date ORDER BY date";
      const [totalRow] = await conn.query(sqlTotal, { type: require('sequelize').QueryTypes.SELECT, replacements: [start, end] });
      const daily = await conn.query(sqlDaily, { type: require('sequelize').QueryTypes.SELECT, replacements: [start, end] });
      return res.json({ connecting_to: envInfo, range: { start, end }, sql_total: sqlTotal, sql_params: [start, end], total_orders: Number(totalRow?.total || 0), daily_breakdown: daily.map(r => ({ date: r.date, total_orders: Number(r.total_orders || 0) })) });
    } catch (e) { console.error('[metrics.diagnoseTotalOrders] failed', e); return res.status(500).json({ error: 'Internal server error' }); }
  }
};

module.exports = MetricsController;
