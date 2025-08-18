require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { z } = require("zod");
const { Sequelize, DataTypes, Op, QueryTypes } = require("sequelize");

const app = express();
app.use(cors());

// ---- DB: Sequelize -----------------------------------------------------------
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    dialect: "mysql",
    dialectModule: require("mysql2"),
    // NOTE: keep timezone if you need it for DATETIME columns. It doesn't affect DATEONLY reads,
    // but we still remove ORM ambiguity by using raw SQL for date filters.
    timezone: "+00:00",
    pool: { max: 10, min: 0, idle: 10000 },
    logging: false,
  }
);

// ---- Model: overall_summary --------------------------------------------------
// Important: use DATEONLY for a DATE column
const OverallSummary = sequelize.define(
  "overall_summary",
  {
    date: { type: DataTypes.DATEONLY }, // <- changed from DATE to DATEONLY
    total_sales: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
    total_orders: { type: DataTypes.DECIMAL(43, 0), allowNull: false, defaultValue: 0 },
    total_sessions: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    total_atc_sessions: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { tableName: "overall_summary", timestamps: false }
);

// ---- Validation --------------------------------------------------------------
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const RangeSchema = z.object({
  start: isoDate.optional(),
  end: isoDate.optional(),
});

// ---- Helpers -----------------------------------------------------------------
// Build inclusive WHERE for raw SQL
function buildWhereClause(start, end) {
  const parts = [];
  const params = [];
  if (start) {
    parts.push("date >= ?");
    params.push(start);
  }
  if (end) {
    parts.push("date <= ?");
    params.push(end);
  }
  const where = parts.length ? `WHERE ${parts.join(" AND ")}` : "";
  return { where, params };
}

// raw SUM helper to avoid ORM coercion issues
async function rawSum(column, { start, end }) {
  const { where, params } = buildWhereClause(start, end);
  const sql = `SELECT COALESCE(SUM(${column}), 0) AS total FROM overall_summary ${where}`;
  const rows = await sequelize.query(sql, { type: QueryTypes.SELECT, replacements: params });
  // rows[0].total can be string for DECIMAL; Number() normalizes it
  return Number(rows[0]?.total || 0);
}

// AOV = SUM(total_sales) / SUM(total_orders)
async function computeAOV({ start, end }) {
  const total_sales = await rawSum("total_sales", { start, end });
  const total_orders = await rawSum("total_orders", { start, end });
  const aov = total_orders > 0 ? total_sales / total_orders : 0;
  return { total_sales, total_orders, aov };
}

// CVR = SUM(total_orders) / SUM(total_sessions)
async function computeCVR({ start, end }) {
  const total_orders = await rawSum("total_orders", { start, end });
  const total_sessions = await rawSum("total_sessions", { start, end });
  const cvr = total_sessions > 0 ? total_orders / total_sessions : 0;
  return { total_orders, total_sessions, cvr, cvr_percent: cvr * 100 };
}

async function computeTotalSales({ start, end }) {
  return rawSum("total_sales", { start, end });
}

async function computeTotalOrders({ start, end }) {
  return rawSum("total_orders", { start, end });
}

async function computeFunnelStats({ start, end }) {
  const [total_sessions, total_atc_sessions, total_orders] = await Promise.all([
    rawSum("total_sessions", { start, end }),
    rawSum("total_atc_sessions", { start, end }),
    rawSum("total_orders", { start, end }),
  ]);
  return { total_sessions, total_atc_sessions, total_orders };
}

// ---- Routes ------------------------------------------------------------------

// GET /metrics/aov?start=YYYY-MM-DD&end=YYYY-MM-DD
app.get("/metrics/aov", async (req, res) => {
  try {
    const parsed = RangeSchema.safeParse({
      start: req.query.start,
      end: req.query.end,
    });
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid date range", details: parsed.error.flatten() });
    }
    const { start, end } = parsed.data;

    await sequelize.authenticate();
    const result = await computeAOV({ start, end });

    return res.json({
      metric: "AOV",
      range: { start: start || null, end: end || null },
      total_sales: result.total_sales,
      total_orders: result.total_orders,
      aov: result.aov,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /metrics/cvr?start=YYYY-MM-DD&end=YYYY-MM-DD
app.get("/metrics/cvr", async (req, res) => {
  try {
    const parsed = RangeSchema.safeParse({
      start: req.query.start,
      end: req.query.end,
    });
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid date range", details: parsed.error.flatten() });
    }
    const { start, end } = parsed.data;

    await sequelize.authenticate();
    const result = await computeCVR({ start, end });

    return res.json({
      metric: "CVR",
      range: { start: start || null, end: end || null },
      total_orders: result.total_orders,
      total_sessions: result.total_sessions,
      cvr: result.cvr,
      cvr_percent: result.cvr_percent,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /metrics/total-sales?start=YYYY-MM-DD&end=YYYY-MM-DD
app.get("/metrics/total-sales", async (req, res) => {
  try {
    const parsed = RangeSchema.safeParse({
      start: req.query.start,
      end: req.query.end,
    });
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid date range", details: parsed.error.flatten() });
    }
    const { start, end } = parsed.data;

    await sequelize.authenticate();
    const total_sales = await computeTotalSales({ start, end });

    return res.json({
      metric: "TOTAL_SALES",
      range: { start: start || null, end: end || null },
      total_sales,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /metrics/total-orders?start=YYYY-MM-DD&end=YYYY-MM-DD
app.get("/metrics/total-orders", async (req, res) => {
  try {
    const parsed = RangeSchema.safeParse({
      start: req.query.start,
      end: req.query.end,
    });
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid date range", details: parsed.error.flatten() });
    }
    const { start, end } = parsed.data;

    await sequelize.authenticate();
    const total_orders = await computeTotalOrders({ start, end });

    return res.json({
      metric: "TOTAL_ORDERS",
      range: { start: start || null, end: end || null },
      total_orders,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /metrics/funnel-stats?start=YYYY-MM-DD&end=YYYY-MM-DD
app.get("/metrics/funnel-stats", async (req, res) => {
  try {
    const parsed = RangeSchema.safeParse({
      start: req.query.start,
      end: req.query.end,
    });
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid date range", details: parsed.error.flatten() });
    }
    const { start, end } = parsed.data;

    await sequelize.authenticate();
    const stats = await computeFunnelStats({ start, end });

    return res.json({
      metric: "FUNNEL_STATS",
      range: { start: start || null, end: end || null },
      total_sessions: stats.total_sessions,
      total_atc_sessions: stats.total_atc_sessions,
      total_orders: stats.total_orders
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// --- DIAG: GET /metrics/diagnose/total-orders?start=YYYY-MM-DD&end=YYYY-MM-DD
app.get("/metrics/diagnose/total-orders", async (req, res) => {
  try {
    const start = req.query.start;
    const end = req.query.end;

    // show connection target
    const [envInfo] = await sequelize.query(
      "SELECT DATABASE() AS db, @@hostname AS host, @@version AS version",
      { type: Sequelize.QueryTypes.SELECT }
    );

    // exact SQL we use in API
    const sqlTotal =
      "SELECT COALESCE(SUM(total_orders),0) AS total FROM overall_summary WHERE date >= ? AND date <= ?";
    const sqlDaily =
      "SELECT date, SUM(total_orders) AS total_orders FROM overall_summary WHERE date >= ? AND date <= ? GROUP BY date ORDER BY date";

    const [totalRow] = await sequelize.query(sqlTotal, {
      type: Sequelize.QueryTypes.SELECT,
      replacements: [start, end],
    });
    const daily = await sequelize.query(sqlDaily, {
      type: Sequelize.QueryTypes.SELECT,
      replacements: [start, end],
    });

    res.json({
      connecting_to: envInfo,
      range: { start, end },
      sql_total: sqlTotal,
      sql_params: [start, end],
      total_orders: Number(totalRow.total || 0),
      daily_breakdown: daily.map(r => ({ date: r.date, total_orders: Number(r.total_orders || 0) })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});


const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Metrics API running on :${port}`));
