require("dotenv").config();
const express = require("express");
const cors = require("cors");
const session = require('express-session');
const SequelizeStoreFactory = require('connect-session-sequelize');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const helmet = require('helmet');
const { z } = require("zod");
const { Sequelize, DataTypes, Op, QueryTypes } = require("sequelize");
// Provide a fetch polyfill for Node versions <18
const fetch = global.fetch || ((...args) => import('node-fetch').then(m => m.default(...args)));

const app = express();
app.use(helmet());

// Parse allowed origins from env (comma separated)
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // non-browser / curl
    if (!allowedOrigins.length || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json());
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1); // so secure cookies work behind reverse proxy / load balancer
}

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

// ---- Models ------------------------------------------------------------------
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

const User = sequelize.define('user', {
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  password_hash: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.STRING, allowNull: false, defaultValue: 'user' },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, { tableName: 'users', timestamps: true });

// ---- Session & Passport -----------------------------------------------------
const SequelizeStore = SequelizeStoreFactory(session.Store);
const sessionStore = new SequelizeStore({ db: sequelize, tableName: 'sessions' });

const isProd = process.env.NODE_ENV === 'production';
const crossSite = process.env.CROSS_SITE === 'true';
app.use(session({
  secret: process.env.SESSION_SECRET || 'change_me_dev_secret',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    httpOnly: true,
    secure: isProd || crossSite, // must be true for SameSite=None
    sameSite: crossSite ? 'none' : 'lax',
    domain: process.env.COOKIE_DOMAIN || undefined, // set if you serve API on subdomain
    maxAge: 1000 * 60 * 60 * 8,
  }
}));

passport.use(new LocalStrategy({ usernameField: 'email', passwordField: 'password' }, async (email, password, done) => {
  try {
    const user = await User.findOne({ where: { email, is_active: true } });
    if (!user) return done(null, false, { message: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return done(null, false, { message: 'Invalid credentials' });
    return done(null, { id: user.id, email: user.email, role: user.role });
  } catch (e) {
    return done(e);
  }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findByPk(id, { attributes: ['id','email','role','is_active'] });
    if (!user || !user.is_active) return done(null, false);
    done(null, { id: user.id, email: user.email, role: user.role });
  } catch (e) { done(e); }
});

app.use(passport.initialize());
app.use(passport.session());

function requireAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

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

// AOV = (SUM(gross_sales) - SUM(total_sales)) / SUM(total_orders)
async function computeAOV({ start, end }) {
  const total_sales = await rawSum("total_sales", { start, end });
  const total_orders = await rawSum("total_orders", { start, end });

  const numerator = total_sales;
  const aov = total_orders > 0 ? numerator / total_orders : 0;

  // Keep response shape unchanged (total_sales & total_orders returned)
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

// ---- Upstream cache (last-updated proxy) ------------------------------------
const lastUpdatedCache = { data: null, fetchedAt: 0 };

// ---- Auth Routes -------------------------------------------------------------
app.post('/auth/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.status(401).json({ error: info?.message || 'Invalid credentials' });
    req.session.regenerate(err2 => {
      if (err2) return next(err2);
      req.login(user, err3 => {
        if (err3) return next(err3);
        return res.json({ user });
      });
    });
  })(req, res, next);
});

app.post('/auth/logout', (req, res) => {
  req.logout && req.logout(() => {});
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.status(204).end();
  });
});

app.get('/auth/me', (req, res) => {
  if (req.isAuthenticated && req.isAuthenticated()) return res.json({ user: req.user });
  return res.status(401).json({ error: 'Unauthorized' });
});

// ---- Routes (Protected) -----------------------------------------------------

// GET /metrics/aov?start=YYYY-MM-DD&end=YYYY-MM-DD
app.get("/metrics/aov", requireAuth, async (req, res) => {
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
app.get("/metrics/cvr", requireAuth, async (req, res) => {
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
app.get("/metrics/total-sales", requireAuth, async (req, res) => {
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
app.get("/metrics/total-orders", requireAuth, async (req, res) => {
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
app.get("/metrics/funnel-stats", requireAuth, async (req, res) => {
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

// Proxy to avoid CORS for external last-updated endpoint
app.get('/external/last-updated/pts', requireAuth, async (req, res) => {
  try {
    const now = Date.now();
    if (lastUpdatedCache.data && now - lastUpdatedCache.fetchedAt < 30_000) {
      return res.json(lastUpdatedCache.data);
    }
    const rows = await sequelize.query(
      "SELECT key_value FROM pipeline_metadata WHERE key_name = 'last_pipeline_completion_time' LIMIT 1",
      { type: QueryTypes.SELECT }
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'No pipeline completion time found' });
    }
    const rawTs = rows[0].key_value; // assumed DATETIME string
    // Normalize to ISO string (treat as UTC)
    const iso = new Date(rawTs.replace(' ', 'T') + 'Z').toISOString();
    const payload = {
      "Last successful run completed at": iso,
      timezone: 'UTC'
    };
    lastUpdatedCache.data = payload;
    lastUpdatedCache.fetchedAt = now;
    res.set('Cache-Control', 'public, max-age=15');
    return res.json(payload);
  } catch (e) {
    console.error('Error fetching last updated from DB', e);
    return res.status(500).json({ error: 'Failed to read last updated' });
  }
});

// --- NEW: GET /metrics/order-split?start=YYYY-MM-DD&end=YYYY-MM-DD
// Returns COD vs Prepaid split (counts and percentages) over the date range.
app.get("/metrics/order-split", requireAuth, async (req, res) => {
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

    const [cod_orders, prepaid_orders] = await Promise.all([
      rawSum("cod_orders", { start, end }),
      rawSum("prepaid_orders", { start, end }),
    ]);

    const total = cod_orders + prepaid_orders;
    const cod_percent = total > 0 ? (cod_orders / total) * 100 : 0;
    const prepaid_percent = total > 0 ? (prepaid_orders / total) * 100 : 0;

    return res.json({
      metric: "ORDER_SPLIT",
      range: { start: start || null, end: end || null },
      cod_orders,
      prepaid_orders,
      total_orders_from_split: total,
      cod_percent,
      prepaid_percent,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// --- DIAG: GET /metrics/diagnose/total-orders?start=YYYY-MM-DD&end=YYYY-MM-DD
app.get("/metrics/diagnose/total-orders", requireAuth, async (req, res) => {
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

// ---- Init -------------------------------------------------------------------
async function init() {
  await sequelize.authenticate();
  await sessionStore.sync();
  await User.sync(); // optionally use migrations in real app
  // seed admin if none
  if (!(await User.findOne({ where: { email: process.env.ADMIN_EMAIL || 'admin@example.com' } }))) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'ChangeMe123!', 12);
    await User.create({ email: process.env.ADMIN_EMAIL || 'admin@example.com', password_hash: hash, role: 'admin' });
    console.log('Seeded admin user');
  }
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Metrics API running on :${port}`));
}
init().catch(e => {
  console.error('Startup failure', e);
  process.exit(1);
});
