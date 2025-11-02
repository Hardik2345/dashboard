// Trend controller: hourly trend, daily trend, and hourly sales compare
const { QueryTypes } = require('sequelize');

function parseIsoDate(s) { return new Date(`${s}T00:00:00Z`); }
function formatIsoDate(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}
function previousWindow(start, end) {
  if (!start || !end) return null;
  const DAY_MS = 24 * 3600_000;
  const s = parseIsoDate(start);
  const e = parseIsoDate(end);
  const days = Math.floor((e.getTime() - s.getTime()) / DAY_MS) + 1;
  const prevEnd = new Date(s.getTime() - DAY_MS);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * DAY_MS);
  return { prevStart: formatIsoDate(prevStart), prevEnd: formatIsoDate(prevEnd) };
}

const TrendController = {
  async hourlyTrend(req, res) {
    try {
      const { z } = require('zod');
      const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
      const RangeSchema = z.object({ start: isoDate, end: isoDate });
      const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
      if (!parsed.success) return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
      const { start, end } = parsed.data;
      if (start > end) return res.status(400).json({ error: 'Start date must be on or before end date' });

      const IST_OFFSET_MIN = 330;
      const offsetMs = IST_OFFSET_MIN * 60 * 1000;
      const nowIst = new Date(Date.now() + offsetMs);
      const todayIst = `${nowIst.getUTCFullYear()}-${String(nowIst.getUTCMonth() + 1).padStart(2, '0')}-${String(nowIst.getUTCDate()).padStart(2, '0')}`;
      const currentHourIst = nowIst.getUTCHours();
      const alignHourRaw = end === todayIst ? currentHourIst : 23;
      const alignHour = Math.max(0, Math.min(23, alignHourRaw));

      const rows = await req.brandDb.sequelize.query(
        `SELECT date, hour, total_sales, number_of_orders, number_of_sessions, number_of_atc_sessions
         FROM hour_wise_sales
         WHERE date >= ? AND date <= ?`,
        { type: QueryTypes.SELECT, replacements: [start, end] }
      );

      const rowMap = new Map();
      for (const row of rows) {
        if (!row?.date) continue;
        const hourVal = typeof row.hour === 'number' ? row.hour : Number(row.hour);
        if (!Number.isFinite(hourVal) || hourVal < 0 || hourVal > 23) continue;
        const key = `${row.date}#${hourVal}`;
        rowMap.set(key, {
          sales: Number(row.total_sales || 0),
          sessions: Number(row.number_of_sessions || 0),
          orders: Number(row.number_of_orders || 0),
          atc: Number(row.number_of_atc_sessions || 0),
        });
      }

      const startDate = parseIsoDate(start);
      const endDate = parseIsoDate(end);
      const DAY_MS = 24 * 3600_000;
      const buckets = [];
      for (let ts = startDate.getTime(); ts <= endDate.getTime(); ts += DAY_MS) {
        const dt = new Date(ts);
        const yyyy = dt.getUTCFullYear();
        const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(dt.getUTCDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;
        const maxHour = dateStr === end ? alignHour : 23;
        for (let hour = 0; hour <= maxHour; hour += 1) {
          buckets.push({ date: dateStr, hour });
        }
      }

      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const points = buckets.map(({ date: bucketDate, hour }) => {
        const metrics = rowMap.get(`${bucketDate}#${hour}`) || { sales: 0, sessions: 0, orders: 0, atc: 0 };
        const cvrRatio = metrics.sessions > 0 ? metrics.orders / metrics.sessions : 0;
        const monthIndex = Math.max(0, Math.min(11, Number(bucketDate.slice(5, 7)) - 1));
        const dayNum = Number(bucketDate.slice(8, 10));
        const label = `${String(dayNum).padStart(2, '0')} ${monthNames[monthIndex]} ${String(hour).padStart(2, '0')}:00`;
        return {
          date: bucketDate,
          hour,
          label,
          metrics: {
            sales: metrics.sales,
            sessions: metrics.sessions,
            orders: metrics.orders,
            atc: metrics.atc,
            cvr_ratio: cvrRatio,
            cvr_percent: cvrRatio * 100,
          }
        };
      });

      const prevWin = previousWindow(start, end);
      let comparison = null;
      if (prevWin?.prevStart && prevWin?.prevEnd) {
        const comparisonAlignHour = end === todayIst ? alignHour : 23;
        const comparisonRows = await req.brandDb.sequelize.query(
          `SELECT date, hour, total_sales, number_of_orders, number_of_sessions, number_of_atc_sessions
           FROM hour_wise_sales
           WHERE date >= ? AND date <= ?`,
          { type: QueryTypes.SELECT, replacements: [prevWin.prevStart, prevWin.prevEnd] }
        );

        const comparisonRowMap = new Map();
        for (const row of comparisonRows) {
          if (!row?.date) continue;
          const hourVal = typeof row.hour === 'number' ? row.hour : Number(row.hour);
          if (!Number.isFinite(hourVal) || hourVal < 0 || hourVal > 23) continue;
          const key = `${row.date}#${hourVal}`;
          comparisonRowMap.set(key, {
            sales: Number(row.total_sales || 0),
            sessions: Number(row.number_of_sessions || 0),
            orders: Number(row.number_of_orders || 0),
            atc: Number(row.number_of_atc_sessions || 0),
          });
        }

        const comparisonBuckets = [];
        for (let ts = parseIsoDate(prevWin.prevStart).getTime(); ts <= parseIsoDate(prevWin.prevEnd).getTime(); ts += DAY_MS) {
          const dt = new Date(ts);
          const yyyy = dt.getUTCFullYear();
          const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
          const dd = String(dt.getUTCDate()).padStart(2, '0');
          const dateStr = `${yyyy}-${mm}-${dd}`;
          const maxHour = dateStr === prevWin.prevEnd ? comparisonAlignHour : 23;
          for (let hour = 0; hour <= maxHour; hour += 1) {
            comparisonBuckets.push({ date: dateStr, hour });
          }
        }

        const hourAcc = Array.from({ length: 24 }, () => ({
          count: 0,
          sales: 0,
          sessions: 0,
          orders: 0,
          atc: 0,
        }));

        for (const { date: bucketDate, hour } of comparisonBuckets) {
          const metrics = comparisonRowMap.get(`${bucketDate}#${hour}`) || { sales: 0, sessions: 0, orders: 0, atc: 0 };
          const acc = hourAcc[hour];
          acc.count += 1;
          acc.sales += metrics.sales;
          acc.sessions += metrics.sessions;
          acc.orders += metrics.orders;
          acc.atc += metrics.atc;
        }

        const avgByHour = hourAcc.map((acc) => {
          if (!acc.count || acc.sessions <= 0) {
            const base = acc.count ? acc : { sales: 0, sessions: 0, orders: 0, atc: 0 };
            return {
              sales: acc.count ? base.sales / acc.count : 0,
              sessions: acc.count ? base.sessions / acc.count : 0,
              orders: acc.count ? base.orders / acc.count : 0,
              atc: acc.count ? base.atc / acc.count : 0,
              cvr_ratio: 0,
              cvr_percent: 0,
            };
          }
          const avgSales = acc.sales / acc.count;
          const avgSessions = acc.sessions / acc.count;
          const avgOrders = acc.orders / acc.count;
          const avgAtc = acc.atc / acc.count;
          const cvrRatio = acc.sessions > 0 ? acc.orders / acc.sessions : 0;
          return {
            sales: avgSales,
            sessions: avgSessions,
            orders: avgOrders,
            atc: avgAtc,
            cvr_ratio: cvrRatio,
            cvr_percent: cvrRatio * 100,
          };
        });

        const comparisonPoints = points.map((point) => {
          const avg = avgByHour[point.hour] || {
            sales: 0,
            sessions: 0,
            orders: 0,
            atc: 0,
            cvr_ratio: 0,
            cvr_percent: 0,
          };
          return { hour: point.hour, label: point.label, metrics: avg };
        });

        comparison = {
          range: { start: prevWin.prevStart, end: prevWin.prevEnd },
          alignHour: comparisonAlignHour,
          points: comparisonPoints,
          hourSampleCount: hourAcc.map((acc) => acc.count),
        };
      }

      return res.json({ range: { start, end }, timezone: 'IST', alignHour, points, comparison });
    } catch (e) {
      console.error('[TrendController.hourlyTrend] failed', e);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },
  async dailyTrend(req, res) {
    try {
      const { z } = require('zod');
      const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
      const RangeSchema = z.object({ start: isoDate, end: isoDate });
      const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
      if (!parsed.success) return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
      const { start, end } = parsed.data;
      if (start > end) return res.status(400).json({ error: 'Start date must be on or before end date' });

      const DAY_MS = 24 * 3600_000;
      const sTs = parseIsoDate(start).getTime();
      const eTs = parseIsoDate(end).getTime();
      const dayList = [];
      for (let ts = sTs; ts <= eTs; ts += DAY_MS) {
        dayList.push(formatIsoDate(new Date(ts)));
      }

      const sql = `
        SELECT date, 
               SUM(total_sales) AS sales,
               SUM(number_of_orders) AS orders,
               SUM(number_of_sessions) AS sessions,
               SUM(number_of_atc_sessions) AS atc
        FROM hour_wise_sales
        WHERE date >= ? AND date <= ?
        GROUP BY date
        ORDER BY date ASC`;
      const rows = await req.brandDb.sequelize.query(sql, { type: QueryTypes.SELECT, replacements: [start, end] });
      const map = new Map(rows.map(r => [r.date, { sales: Number(r.sales || 0), orders: Number(r.orders || 0), sessions: Number(r.sessions || 0), atc: Number(r.atc || 0) }]));
      const days = dayList.map(d => {
        const m = map.get(d) || { sales: 0, orders: 0, sessions: 0, atc: 0 };
        const cvr = m.sessions > 0 ? m.orders / m.sessions : 0;
        return { date: d, label: d, metrics: { ...m, cvr_ratio: cvr, cvr_percent: cvr * 100 } };
      });

      const prevWin = previousWindow(start, end);
      let comparison = null;
      if (prevWin?.prevStart && prevWin?.prevEnd) {
        const pDayList = [];
        for (let ts = parseIsoDate(prevWin.prevStart).getTime(); ts <= parseIsoDate(prevWin.prevEnd).getTime(); ts += DAY_MS) {
          pDayList.push(formatIsoDate(new Date(ts)));
        }
        const pRows = await req.brandDb.sequelize.query(sql, { type: QueryTypes.SELECT, replacements: [prevWin.prevStart, prevWin.prevEnd] });
        const pMap = new Map(pRows.map(r => [r.date, { sales: Number(r.sales || 0), orders: Number(r.orders || 0), sessions: Number(r.sessions || 0), atc: Number(r.atc || 0) }]));
        const pDays = pDayList.map(d => {
          const m = pMap.get(d) || { sales: 0, orders: 0, sessions: 0, atc: 0 };
          const cvr = m.sessions > 0 ? m.orders / m.sessions : 0;
          return { date: d, label: d, metrics: { ...m, cvr_ratio: cvr, cvr_percent: cvr * 100 } };
        });
        comparison = { range: { start: prevWin.prevStart, end: prevWin.prevEnd }, days: pDays };
      }

      return res.json({ range: { start, end }, timezone: 'IST', days, comparison });
    } catch (e) {
      console.error('[TrendController.dailyTrend] failed', e);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },
  async hourlySalesCompare(req, res) {
    try {
      const hoursParam = Number(req.query.hours || 6);
      const N = Math.max(1, Math.min(12, Number.isFinite(hoursParam) ? Math.floor(hoursParam) : 6));

      const IST_OFFSET_MIN = 330; // minutes
      const offsetMs = IST_OFFSET_MIN * 60 * 1000;

      const nowUtc = new Date();
      const nowIst = new Date(nowUtc.getTime() + offsetMs);
      nowIst.setUTCMinutes(0, 0, 0);

      const bucketsIst = [];
      for (let i = N - 1; i >= 0; i--) {
        const ist = new Date(nowIst.getTime() - i * 3600_000);
        const yyyy = ist.getUTCFullYear();
        const mm = String(ist.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(ist.getUTCDate()).padStart(2, '0');
        const hour = ist.getUTCHours();
        bucketsIst.push({ date: `${yyyy}-${mm}-${dd}`, hour });
      }
      const yBucketsIst = bucketsIst.map(b => {
        const ist = new Date(Date.UTC(Number(b.date.slice(0, 4)), Number(b.date.slice(5, 7)) - 1, Number(b.date.slice(8, 10)), b.hour, 0, 0, 0));
        const prev = new Date(ist.getTime() - 24 * 3600_000);
        const yyyy = prev.getUTCFullYear();
        const mm = String(prev.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(prev.getUTCDate()).padStart(2, '0');
        return { date: `${yyyy}-${mm}-${dd}`, hour: prev.getUTCHours() };
      });

      function buildWherePairs(num) { return Array(num).fill('(date = ? AND hour = ?)').join(' OR '); }
      const where = buildWherePairs(N);
      const paramsCurrent = bucketsIst.flatMap(b => [b.date, b.hour]);
      const paramsY = yBucketsIst.flatMap(b => [b.date, b.hour]);

      const sql = `SELECT date, hour, total_sales FROM hour_wise_sales WHERE ${where}`;
      const [rowsCurrent, rowsY] = await Promise.all([
        req.brandDb.sequelize.query(sql, { type: QueryTypes.SELECT, replacements: paramsCurrent }),
        req.brandDb.sequelize.query(sql, { type: QueryTypes.SELECT, replacements: paramsY }),
      ]);

      const mapCurrent = new Map();
      for (const r of rowsCurrent) { mapCurrent.set(`${r.date}#${r.hour}`, Number(r.total_sales || 0)); }
      const mapY = new Map();
      for (const r of rowsY) { mapY.set(`${r.date}#${r.hour}`, Number(r.total_sales || 0)); }

      const labels = bucketsIst.map(b => `${String(b.hour).padStart(2, '0')}:00`);
      const current = bucketsIst.map(b => mapCurrent.get(`${b.date}#${b.hour}`) || 0);
      const yesterday = yBucketsIst.map(b => mapY.get(`${b.date}#${b.hour}`) || 0);

      return res.json({ labels, series: { current, yesterday }, tz: 'IST' });
    } catch (e) {
      console.error('[TrendController.hourlySalesCompare] failed', e);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
};

module.exports = TrendController;
