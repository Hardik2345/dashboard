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
const { brandContext } = require('./middleware/brandContext');
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

// Global User model no longer used for authentication (auth is brand-specific now)
const User = sequelize.define('user', {
  email: { type: DataTypes.STRING },
  password_hash: { type: DataTypes.STRING },
  role: { type: DataTypes.STRING },
  is_active: { type: DataTypes.BOOLEAN }
}, { tableName: 'users', timestamps: true });
const { resolveBrandFromEmail, addBrandRuntime, getBrands } = require('./config/brands');
const { getBrandConnection } = require('./lib/brandConnectionManager');

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
    const authorEmail = (process.env.AUTHOR_EMAIL || '').toLowerCase();
    if (authorEmail && email.toLowerCase() === authorEmail) {
      // Author path (base connection)
      try {
        const authorUser = await User.findOne({ where: { email: authorEmail, is_active: true } });
        if (!authorUser || authorUser.role !== 'author') {
          return done(null, false, { message: 'Invalid credentials' });
        }
        const ok = await bcrypt.compare(password, authorUser.password_hash);
        if (!ok) return done(null, false, { message: 'Invalid credentials' });
        return done(null, { id: authorUser.id, email: authorUser.email, role: 'author', isAuthor: true, brandKey: null });
      } catch (e) {
        return done(e);
      }
    }

    // Brand user path
    const brandCfg = resolveBrandFromEmail(email);
    console.log(`Authenticating brand user ${email} with brand config:`, brandCfg);
    if (!brandCfg) return done(null, false, { message: 'Unknown brand' });
    const brandConn = await getBrandConnection(brandCfg);
    const BrandUser = brandConn.models.User;
    const user = await BrandUser.findOne({ where: { email, is_active: true } });
    if (!user) return done(null, false, { message: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return done(null, false, { message: 'Invalid credentials' });
    return done(null, { id: user.id, email: user.email, role: user.role, brandKey: brandCfg.key, isAuthor: false });
  } catch (e) {
    return done(e);
  }
}));

passport.serializeUser((user, done) => done(null, { id: user.id, email: user.email, brandKey: user.brandKey, isAuthor: !!user.isAuthor }));
passport.deserializeUser(async (obj, done) => {
  try {
    if (obj.isAuthor) {
      const authorEmail = (process.env.AUTHOR_EMAIL || '').toLowerCase();
      if (authorEmail !== obj.email.toLowerCase()) return done(null, false);
      const authorUser = await User.findByPk(obj.id, { attributes: ['id','email','role','is_active'] });
      if (!authorUser || !authorUser.is_active || authorUser.role !== 'author') return done(null, false);
      return done(null, { id: authorUser.id, email: authorUser.email, role: 'author', brandKey: null, isAuthor: true });
    }
    const brandCfg = resolveBrandFromEmail(obj.email);
    if (!brandCfg) return done(null, false);
    const brandConn = await getBrandConnection(brandCfg);
    const BrandUser = brandConn.models.User;
    const user = await BrandUser.findByPk(obj.id, { attributes: ['id','email','role','is_active'] });
    if (!user || !user.is_active) return done(null, false);
    done(null, { id: user.id, email: user.email, role: user.role, brandKey: brandCfg.key, isAuthor: false });
  } catch (e) { done(e); }
});

app.use(passport.initialize());
app.use(passport.session());

function requireAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

function requireAuthor(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated() && req.user?.isAuthor) return next();
  return res.status(403).json({ error: 'Forbidden' });
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
async function rawSum(column, { start, end, conn }) {
  const { where, params } = buildWhereClause(start, end);
  const sql = `SELECT COALESCE(SUM(${column}), 0) AS total FROM overall_summary ${where}`;
  const rows = await conn.query(sql, { type: QueryTypes.SELECT, replacements: params });
  return Number(rows[0]?.total || 0);
}

// AOV = (SUM(gross_sales) - SUM(total_sales)) / SUM(total_orders)
async function computeAOV({ start, end, conn }) {
  const total_sales = await rawSum("total_sales", { start, end, conn });
  const total_orders = await rawSum("total_orders", { start, end, conn });

  const numerator = total_sales;
  const aov = total_orders > 0 ? numerator / total_orders : 0;

  // Keep response shape unchanged (total_sales & total_orders returned)
  return { total_sales, total_orders, aov };
}

// CVR = SUM(total_orders) / SUM(total_sessions)
async function computeCVR({ start, end, conn }) {
  const total_orders = await rawSum("total_orders", { start, end, conn });
  const total_sessions = await rawSum("total_sessions", { start, end, conn });
  const cvr = total_sessions > 0 ? total_orders / total_sessions : 0;
  return { total_orders, total_sessions, cvr, cvr_percent: cvr * 100 };
}

// Helper: compute CVR for a single calendar day (YYYY-MM-DD)
async function computeCVRForDay(date, conn) {
  if (!date) return { total_orders: 0, total_sessions: 0, cvr: 0, cvr_percent: 0 };
  return computeCVR({ start: date, end: date, conn });
}

async function computeTotalSales({ start, end, conn }) { return rawSum("total_sales", { start, end, conn }); }
async function computeTotalOrders({ start, end, conn }) { return rawSum("total_orders", { start, end, conn }); }
async function computeFunnelStats({ start, end, conn }) {
  const [total_sessions, total_atc_sessions, total_orders] = await Promise.all([
    rawSum("total_sessions", { start, end, conn }),
    rawSum("total_atc_sessions", { start, end, conn }),
    rawSum("total_orders", { start, end, conn }),
  ]);
  return { total_sessions, total_atc_sessions, total_orders };
}

// --- Delta helpers (day vs previous day) ------------------------------------
function prevDayStr(date) {
  const d = new Date(`${date}T00:00:00Z`);
  const prev = new Date(d.getTime() - 24 * 3600_000);
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}-${String(prev.getUTCDate()).padStart(2, '0')}`;
}

async function sumForDay(column, date, conn) {
  return rawSum(column, { start: date, end: date, conn });
}

async function deltaForSum(column, date, conn) {
  if (!date) return { current: 0, previous: 0, diff_pct: 0, direction: 'flat' };
  const prev = prevDayStr(date);
  const [curr, prevVal] = await Promise.all([
    sumForDay(column, date, conn),
    sumForDay(column, prev, conn)
  ]);
  const diff = curr - prevVal;
  const diff_pct = prevVal > 0 ? (diff / prevVal) * 100 : (curr > 0 ? 100 : 0);
  const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
  return { current: curr, previous: prevVal, diff_pct, direction };
}

async function aovForDay(date, conn) {
  const r = await computeAOV({ start: date, end: date, conn });
  return r.aov || 0;
}

async function deltaForAOV(date, conn) {
  if (!date) return { current: 0, previous: 0, diff_pct: 0, direction: 'flat' };
  const prev = prevDayStr(date);
  const [curr, prevVal] = await Promise.all([
    aovForDay(date, conn),
    aovForDay(prev, conn)
  ]);
  const diff = curr - prevVal;
  const diff_pct = prevVal > 0 ? (diff / prevVal) * 100 : (curr > 0 ? 100 : 0);
  const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
  return { current: curr, previous: prevVal, diff_pct, direction };
}

// ---- Range-average helpers --------------------------------------------------
function parseIsoDate(s) { return new Date(`${s}T00:00:00Z`); }
function formatIsoDate(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}
function daysInclusive(start, end) {
  const ds = parseIsoDate(start).getTime();
  const de = parseIsoDate(end).getTime();
  return Math.floor((de - ds) / 86400000) + 1;
}
function shiftDays(dateStr, delta) {
  const d = parseIsoDate(dateStr);
  d.setUTCDate(d.getUTCDate() + delta);
  return formatIsoDate(d);
}

async function avgForRange(column, { start, end, conn }) {
  if (!start || !end) return 0;
  const n = daysInclusive(start, end);
  if (n <= 0) return 0;
  const total = await rawSum(column, { start, end, conn });
  return total / n;
}

function previousWindow(start, end) {
  if (!start || !end) return null;
  const n = daysInclusive(start, end);
  const prevEnd = shiftDays(start, -1);
  const prevStart = shiftDays(prevEnd, -(n - 1));
  return { prevStart, prevEnd };
}

async function aovForRange({ start, end, conn }) {
  if (!start || !end) return 0;
  const { total_sales, total_orders } = await computeAOV({ start, end, conn });
  return total_orders > 0 ? total_sales / total_orders : 0;
}

async function cvrForRange({ start, end, conn }) {
  if (!start || !end) return { cvr: 0, cvr_percent: 0 };
  const { total_orders, total_sessions } = await computeCVR({ start, end, conn });
  const cvr = total_sessions > 0 ? total_orders / total_sessions : 0;
  return { cvr, cvr_percent: cvr * 100 };
}

// ---- Upstream cache (last-updated proxy) ------------------------------------
const lastUpdatedCache = { data: null, fetchedAt: 0 };

// ---- Auth Routes -------------------------------------------------------------

// Mount new routers for auth and author (Phase 1)
const { createAuthRouter, createAuthorRouter } = require('./routes');
const AuthController = require('./controllers/auth.controller');
const AuthorController = require('./controllers/author.controller');
app.use('/auth', createAuthRouter({ controllers: { AuthController } }));
app.use('/author', createAuthorRouter({ requireAuth, controllers: { AuthorController } }));

// Author routes migrated via router (brands endpoints & author/me)

// ---- Routes (Protected) -----------------------------------------------------

// Metrics routes migrated to router
const MetricsController = require('./controllers/metrics.controller');
const TrendController = require('./controllers/trend.controller');
const { createMetricsRouter, createTrendRouter } = require('./routes');
app.use('/metrics', createMetricsRouter({ requireAuth, brandContext, controllers: { MetricsController } }));
app.use('/metrics', createTrendRouter({ requireAuth, brandContext, controllers: { TrendController } }));

// (see routes/metrics.routes.js)

// CVR delta migrated to controller via router

// Deltas and splits migrated to router

// (see routes/metrics.routes.js)

// (migrated)

// (migrated)

// (migrated)

// (migrated)

// (migrated)

// (migrated)

// External routes (migrated)
const ExternalController = require('./controllers/external.controller');
const { createExternalRouter } = require('./routes');
app.use('/external', createExternalRouter({ requireAuth, brandContext, controllers: { ExternalController } }));


// (migrated)

// (migrated)

// Hourly trend migrated to TrendController via router

// Daily trend migrated to TrendController via router

// Hourly sales compare migrated to TrendController via router

// --- DIAG: GET /metrics/diagnose/total-orders?start=YYYY-MM-DD&end=YYYY-MM-DD
// Diagnose endpoint migrated to controller via router

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
  // seed author if configured
  if (process.env.AUTHOR_EMAIL && process.env.AUTHOR_PASSWORD) {
    const existingAuthor = await User.findOne({ where: { email: process.env.AUTHOR_EMAIL } });
    if (!existingAuthor) {
      const hash = await bcrypt.hash(process.env.AUTHOR_PASSWORD, 12);
      await User.create({ email: process.env.AUTHOR_EMAIL, password_hash: hash, role: 'author', is_active: true });
      console.log('Seeded author user');
    }
  }
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Metrics API running on :${port}`));
}
init().catch(e => {
  console.error('Startup failure', e);
  process.exit(1);
});