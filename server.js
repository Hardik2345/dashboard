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
    // Newly added adjusted column (DDL already applied). We still define it here so Sequelize metadata queries work.
    adjusted_total_sessions: { type: DataTypes.BIGINT, allowNull: true },
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

// Author session adjustment bucket & audit models (tables created via manual DDL already).
// Now scoped per-brand via brand_key (user has applied DDL already).
// lower_bound_sessions / upper_bound_sessions define an inclusive range. If daily sessions fall inside a range
// and the bucket is active and (effective_from/effective_to) match, we apply offset_pct (+/- percentage) when previewing/applying.
// Priority: lower numeric value wins among overlapping buckets.
const SessionAdjustmentBucket = sequelize.define('session_adjustment_buckets', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  brand_key: { type: DataTypes.STRING(32), allowNull: false },
  lower_bound_sessions: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  upper_bound_sessions: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  offset_pct: { type: DataTypes.DECIMAL(5,2), allowNull: false }, // e.g. -8.00 to +12.50
  active: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
  priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 },
  effective_from: { type: DataTypes.DATEONLY, allowNull: true },
  effective_to: { type: DataTypes.DATEONLY, allowNull: true },
  notes: { type: DataTypes.STRING(255), allowNull: true },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  // Important: do NOT use "ON UPDATE CURRENT_TIMESTAMP" inside a VALUES clause; leave that to the column definition.
  // Here we only provide CURRENT_TIMESTAMP as default so INSERT works across MySQL variants.
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
}, { tableName: 'session_adjustment_buckets', timestamps: false });

const SessionAdjustmentAudit = sequelize.define('session_adjustment_audit', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  brand_key: { type: DataTypes.STRING(32), allowNull: false },
  bucket_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
  action: { type: DataTypes.ENUM('CREATE','UPDATE','DEACTIVATE','DELETE'), allowNull: false },
  before_json: { type: DataTypes.JSON, allowNull: true },
  after_json: { type: DataTypes.JSON, allowNull: true },
  author_user_id: { type: DataTypes.BIGINT, allowNull: true },
  changed_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
}, { tableName: 'session_adjustment_audit', timestamps: false });
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
  // Prefer adjusted_total_sessions when requesting total_sessions.
  let selectExpr = column;
  if (column === 'total_sessions') {
    selectExpr = 'COALESCE(adjusted_total_sessions, total_sessions)';
  }
  const sql = `SELECT COALESCE(SUM(${selectExpr}), 0) AS total FROM overall_summary ${where}`;
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
  const total_sessions = await rawSum("total_sessions", { start, end, conn }); // already prefers adjusted column
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
    rawSum("total_sessions", { start, end, conn }), // adjusted-aware
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

// Author info endpoint
app.get('/author/me', requireAuth, (req, res) => {
  if (!req.user?.isAuthor) return res.status(403).json({ error: 'Forbidden' });
  return res.json({ user: { email: req.user.email, role: 'author', isAuthor: true } });
});

// ----------------------------- AUTHOR: ADJUSTMENT BUCKET CRUD -----------------------------
// Validation schemas (Zod) for bucket operations
const BucketSchema = z.object({
  brand_key: z.string().min(2).max(32).transform(s => s.toUpperCase()),
  lower_bound_sessions: z.number().int().nonnegative(),
  upper_bound_sessions: z.number().int().nonnegative(),
  offset_pct: z.number().min(-100).max(100),
  active: z.boolean().optional(),
  priority: z.number().int().min(0).max(10000).optional(),
  effective_from: isoDate.nullable().optional(),
  effective_to: isoDate.nullable().optional(),
  notes: z.string().max(255).optional().nullable()
}).refine(d => d.lower_bound_sessions <= d.upper_bound_sessions, { message: 'lower_bound_sessions must be <= upper_bound_sessions' });

function requireBrandKey(keyRaw) {
  const key = (keyRaw || '').toString().trim().toUpperCase();
  if (!key) return { error: 'brand_key required' };
  const map = getBrands();
  const cfg = map[key];
  if (!cfg) return { error: `Unknown brand_key ${key}` };
  return { key, cfg };
}

// List buckets (with optional filters)
app.get('/author/adjustment-buckets', requireAuthor, async (req, res) => {
  try {
    const { active, brand_key: brandKeyParam } = req.query;
    const brandCheck = requireBrandKey(brandKeyParam);
    if (brandCheck.error) return res.status(400).json({ error: brandCheck.error });
    const where = { brand_key: brandCheck.key };
    if (active === '1' || active === '0') where.active = active === '1' ? 1 : 0;
    const buckets = await SessionAdjustmentBucket.findAll({ where, order: [['priority','ASC'], ['id','ASC']] });
    return res.json({ buckets });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Failed to list buckets' }); }
});

// Create bucket
app.post('/author/adjustment-buckets', requireAuthor, async (req, res) => {
  try {
    const parsed = BucketSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    const data = parsed.data;
    // Optional effective date ordering check
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
      // Avoid inserting created_at/updated_at explicitly; let DB defaults handle them
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
    return res.status(201).json({ bucket });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Failed to create bucket' }); }
});

// Update bucket
app.put('/author/adjustment-buckets/:id', requireAuthor, async (req, res) => {
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
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Failed to update bucket' }); }
});

// Deactivate (soft delete) bucket
app.delete('/author/adjustment-buckets/:id', requireAuthor, async (req, res) => {
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
    return res.status(204).end();
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Failed to deactivate bucket' }); }
});

// Preview adjustments over a date range (does NOT persist). Applies first matching bucket by priority.
app.get('/author/adjustments/preview', requireAuthor, async (req, res) => {
  try {
    const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
    if (!parsed.success) return res.status(400).json({ error: 'Invalid range', details: parsed.error.flatten() });
    const { start, end } = parsed.data;
    if (!start || !end) return res.status(400).json({ error: 'start and end required' });
    if (start > end) return res.status(400).json({ error: 'start must be <= end' });
    const brandCheck = requireBrandKey(req.query.brand_key);
    if (brandCheck.error) return res.status(400).json({ error: brandCheck.error });

  // Fetch all buckets for visibility and active ones for application
  const allBuckets = await SessionAdjustmentBucket.findAll({ where: { brand_key: brandCheck.key }, order: [['priority','ASC'], ['id','ASC']] });
  const buckets = allBuckets.filter(b => Number(b.active) === 1);

    const brandConn = await getBrandConnection(brandCheck.cfg);

    // Build day list
    const days = [];
    const DAY_MS = 86400000;
    const startTs = Date.parse(`${start}T00:00:00Z`);
    const endTs = Date.parse(`${end}T00:00:00Z`);
    for (let t = startTs; t <= endTs; t += DAY_MS) {
      const d = new Date(t);
      const iso = d.toISOString().slice(0,10);
      days.push(iso);
    }

    // Query raw (might already have adjusted; we treat total_sessions as raw base)
    const rows = await brandConn.sequelize.query(
      'SELECT date, total_sessions, adjusted_total_sessions FROM overall_summary WHERE date >= ? AND date <= ? ORDER BY date',
      { type: QueryTypes.SELECT, replacements: [start, end] }
    );
    const rowMap = new Map(rows.map(r => [r.date, r]));

    const resultDays = [];
    for (const d of days) {
      const r = rowMap.get(d) || { total_sessions: 0, adjusted_total_sessions: null };
      const rawSessions = Number(r.total_sessions || 0);
      // Collect all matching active buckets (by priority order)
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
        // Compound multiplicatively in priority order; round only at the end
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

    return res.json({ range: { start, end }, days: resultDays, totals: { raw: totalRaw, adjusted: totalAdj, delta: totalDelta, delta_pct: totalDeltaPct }, buckets: allBuckets });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Preview failed' }); }
});

// Apply adjustments persistently (writes adjusted_total_sessions). Idempotent re-application allowed.
app.post('/author/adjustments/apply', requireAuthor, async (req, res) => {
  try {
    const parsed = RangeSchema.safeParse({ start: req.body.start, end: req.body.end });
    if (!parsed.success) return res.status(400).json({ error: 'Invalid range', details: parsed.error.flatten() });
    const { start, end } = parsed.data;
    if (!start || !end) return res.status(400).json({ error: 'start and end required' });
    if (start > end) return res.status(400).json({ error: 'start must be <= end' });
    const brandCheck = requireBrandKey(req.body.brand_key);
    if (brandCheck.error) return res.status(400).json({ error: brandCheck.error });
    const brandConn = await getBrandConnection(brandCheck.cfg);

  const allBuckets = await SessionAdjustmentBucket.findAll({ where: { brand_key: brandCheck.key }, order: [['priority','ASC'], ['id','ASC']] });
  const buckets = allBuckets.filter(b => Number(b.active) === 1);
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
    // Bulk update using one big CASE statement (avoids per-row updates)
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
      after_json: { applied_range: { start, end }, rows: updates.length },
      author_user_id: req.user.id
    });
    return res.json({ applied: updates.length, range: { start, end } });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Apply failed' }); }
});

// List brands (author only)
app.get('/author/brands', requireAuth, (req, res) => {
  if (!req.user?.isAuthor) return res.status(403).json({ error: 'Forbidden' });
  return res.json({ brands: Object.values(getBrands()).map(b => ({ key: b.key, host: b.dbHost, db: b.dbName })) });
});

// In-memory mutex to serialize persistence operations
const brandPersistLock = { locked: false };
async function withBrandLock(fn) {
  while (brandPersistLock.locked) { await new Promise(r => setTimeout(r, 50)); }
  brandPersistLock.locked = true;
  try { return await fn(); } finally { brandPersistLock.locked = false; }
}
const { fetchEnvVars, upsertBrandsConfig, triggerDeploy } = require('./lib/renderClient');

// Create / persist brand (optional redeploy via Render)
app.post('/author/brands', requireAuth, async (req, res) => {
  if (!req.user?.isAuthor) return res.status(403).json({ error: 'Forbidden' });
  const body = req.body || {};
  const errors = [];
  function reqStr(k){ if(!body[k]||typeof body[k]!== 'string'||!body[k].trim()) errors.push(k); }
  ['key','dbHost','dbUser','dbPass','dbName'].forEach(reqStr);
  if (body.key && !/^[A-Z0-9_]{2,20}$/i.test(body.key)) errors.push('key_format');
  const persist = !!body.persist;
  const dryRun = !!body.dryRun;
  if (errors.length) return res.status(400).json({ error: 'Invalid input', fields: errors });
  const upperKey = body.key.toUpperCase();
  let brandCfg;
  try {
    brandCfg = addBrandRuntime({
      key: upperKey,
      dbHost: body.dbHost.trim(),
      dbPort: body.dbPort || 3306,
      dbUser: body.dbUser.trim(),
      dbPass: body.dbPass,
      dbName: body.dbName.trim(),
    });
  } catch (e) { return res.status(400).json({ error: e.message }); }

  // Connection test early; if fails rollback runtime addition
  try {
    const conn = await getBrandConnection(brandCfg);
    await conn.sequelize.authenticate();
  } catch (e) {
    // remove from map (simple rollback)
    const current = require('./config/brands');
    if (current.brands && current.brands[upperKey]) delete current.brands[upperKey];
    return res.status(400).json({ error: 'Connection failed', detail: e.message });
  }

  if (!persist) {
    return res.status(201).json({ brand: { key: brandCfg.key }, persisted: false });
  }

  if (!process.env.RENDER_API_KEY || !process.env.SERVICE_ID) {
    return res.status(501).json({ error: 'Persistence unavailable', detail: 'Missing RENDER_API_KEY or SERVICE_ID' });
  }

  try {
    const result = await withBrandLock(async () => {
      let existing = [];
      try { existing = await fetchEnvVars(process.env.SERVICE_ID); } catch (e) {
        throw new Error('Failed to fetch env vars: ' + (e.message || 'unknown'));
      }
      const brandsVar = existing.find(v => v.key === 'BRANDS_CONFIG');
      let arr = [];
      if (brandsVar && brandsVar.value) {
        try { arr = JSON.parse(brandsVar.value); } catch (_) { /* ignore parse error; treat as empty */ }
      }
      if (arr.some(b => (b.key||'').toUpperCase() === upperKey)) {
        return { status: 'exists', deploy: null };
      }
      const newEntry = {
        key: upperKey,
        dbHost: brandCfg.dbHost,
        dbPort: brandCfg.dbPort,
        dbUser: brandCfg.dbUser,
        dbPass: brandCfg.dbPass,
        dbName: brandCfg.dbName,
      };
      const updated = [...arr, newEntry].sort((a,b) => a.key.localeCompare(b.key));
      if (dryRun) {
        const hash = require('crypto').createHash('sha256').update(JSON.stringify(updated)).digest('hex').slice(0,12);
        return { status: 'dry-run', hash };
      }
      try { await upsertBrandsConfig(process.env.SERVICE_ID, updated, existing); } catch (e) {
        throw new Error('Failed to upsert BRANDS_CONFIG: ' + (e.message || 'unknown'));
      }
      let deploy;
      try { deploy = await triggerDeploy(process.env.SERVICE_ID, `Add brand ${upperKey}`); } catch (e) {
        throw new Error('Env updated but deploy trigger failed: ' + (e.message || 'unknown'));
      }
      return { status: 'persisted', deploy };
    });
    if (result.status === 'exists') {
      return res.status(409).json({ error: 'Brand already persisted', brand: { key: upperKey } });
    }
    if (result.status === 'dry-run') {
      return res.status(200).json({ brand: { key: upperKey }, dryRun: true, envPreviewHash: result.hash });
    }
    return res.status(202).json({ brand: { key: upperKey }, persisted: true, deployId: result.deploy?.id });
  } catch (e) {
    console.error('[brand-persist] failure', e);
    return res.status(502).json({ error: 'Persistence failed', detail: e.message });
  }
});

// ---- Routes (Protected) -----------------------------------------------------

// GET /metrics/aov?start=YYYY-MM-DD&end=YYYY-MM-DD
app.get("/metrics/aov", requireAuth, brandContext, async (req, res) => {
  try {
    const parsed = RangeSchema.safeParse({
      start: req.query.start,
      end: req.query.end,
    });
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid date range", details: parsed.error.flatten() });
    }
    const { start, end } = parsed.data;

  const result = await computeAOV({ start, end, conn: req.brandDb.sequelize });

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
app.get("/metrics/cvr", requireAuth, brandContext, async (req, res) => {
  try {
    const parsed = RangeSchema.safeParse({
      start: req.query.start,
      end: req.query.end,
    });
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid date range", details: parsed.error.flatten() });
    }
    const { start, end } = parsed.data;

  const result = await computeCVR({ start, end, conn: req.brandDb.sequelize });

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

// GET /metrics/cvr-delta?start=YYYY-MM-DD&end=YYYY-MM-DD
// Compares CVR for the selected day (prefers end, else start) against the previous day.
// Supports align=hour to compare cumulative up to current IST hour vs same hour yesterday.
app.get("/metrics/cvr-delta", requireAuth, brandContext, async (req, res) => {
  try {
    const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid date range", details: parsed.error.flatten() });
    }
    const { start, end } = parsed.data;
    const target = end || start; // pick explicit end, otherwise start
    if (!target) {
      return res.json({ metric: 'CVR_DELTA', date: null, current: null, previous: null, diff_pp: 0, direction: 'flat' });
    }
    const align = (req.query.align || '').toString().toLowerCase();
    const compare = (req.query.compare || '').toString().toLowerCase();

    if (compare === 'prev-range-avg' && start && end) {
      const curr = await cvrForRange({ start, end, conn: req.brandDb.sequelize });
      const prevWin = previousWindow(start, end);
      const prev = await cvrForRange({ start: prevWin.prevStart, end: prevWin.prevEnd, conn: req.brandDb.sequelize });
      const diff_pp = (curr.cvr_percent || 0) - (prev.cvr_percent || 0);
      const direction = diff_pp > 0.0001 ? 'up' : diff_pp < -0.0001 ? 'down' : 'flat';
      return res.json({
        metric: 'CVR_DELTA',
        range: { start, end },
        current: curr,
        previous: prev,
        diff_pp,
        direction,
        compare: 'prev-range-avg'
      });
    }

    // previous day string
    const base = new Date(`${target}T00:00:00Z`);
    const prev = new Date(base.getTime() - 24 * 3600_000);
    const prevStr = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth()+1).padStart(2,'0')}-${String(prev.getUTCDate()).padStart(2,'0')}`;

    const conn = req.brandDb.sequelize;
    if (align === 'hour') {
      // Determine target hour (IST now if target is today; else 23)
      const IST_OFFSET_MIN = 330;
      const offsetMs = IST_OFFSET_MIN * 60 * 1000;
      const nowUtc = new Date();
      const nowIst = new Date(nowUtc.getTime() + offsetMs);
      const yyyy = nowIst.getUTCFullYear();
      const mm = String(nowIst.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(nowIst.getUTCDate()).padStart(2, '0');
      const todayIst = `${yyyy}-${mm}-${dd}`;
      const resolveTargetHour = (endOrDate) => (endOrDate === todayIst ? nowIst.getUTCHours() : 23);

      if (start && end) {
        // Range: align to current IST hour if includes today; else full-day (23)
        const targetHour = resolveTargetHour(end);

        // Sessions cumulative across range
  const sqlSessRange = `SELECT COALESCE(SUM(COALESCE(adjusted_number_of_sessions, number_of_sessions)),0) AS total FROM hourly_sessions_summary WHERE date >= ? AND date <= ? AND hour <= ?`;

        // Orders cumulative across range, using IST date/hour buckets and counting distinct order_name per bucket
        function istRangeUtcBounds(s, e) {
          const y1 = Number(s.slice(0,4));
          const m1 = Number(s.slice(5,7));
          const d1 = Number(s.slice(8,10));
          const y2 = Number(e.slice(0,4));
          const m2 = Number(e.slice(5,7));
          const d2 = Number(e.slice(8,10));
          const startUtcMs = Date.UTC(y1, m1 - 1, d1, 0, 0, 0) - offsetMs; // IST midnight -> UTC
          const endUtcMs = Date.UTC(y2, m2 - 1, d2 + 1, 0, 0, 0) - offsetMs; // end date + 1 day IST midnight -> UTC
          const startStr = new Date(startUtcMs).toISOString().slice(0,19).replace('T',' ');
          const endStr = new Date(endUtcMs).toISOString().slice(0,19).replace('T',' ');
          return { startStr, endStr };
        }
        const sqlOrdersRange = `
          SELECT COALESCE(SUM(cnt),0) AS total FROM (
            SELECT DATE(CONVERT_TZ(created_at, '+00:00', '+05:30')) AS d,
                   HOUR(CONVERT_TZ(created_at, '+00:00', '+05:30')) AS h,
                   COUNT(DISTINCT order_name) AS cnt
            FROM shopify_orders
            WHERE created_at >= ? AND created_at < ?
            GROUP BY d, h
          ) t
          WHERE h <= ? AND d >= ? AND d <= ?`;

        const prevWin = previousWindow(start, end);
        const [{ startStr, endStr }, { startStr: pStartStr, endStr: pEndStr }] = [
          istRangeUtcBounds(start, end),
          istRangeUtcBounds(prevWin.prevStart, prevWin.prevEnd)
        ];

        const [sessCurRows, sessPrevRows, ordCurRows, ordPrevRows] = await Promise.all([
          conn.query(sqlSessRange, { type: QueryTypes.SELECT, replacements: [start, end, targetHour] }),
          conn.query(sqlSessRange, { type: QueryTypes.SELECT, replacements: [prevWin.prevStart, prevWin.prevEnd, targetHour] }),
          conn.query(sqlOrdersRange, { type: QueryTypes.SELECT, replacements: [startStr, endStr, targetHour, start, end] }),
          conn.query(sqlOrdersRange, { type: QueryTypes.SELECT, replacements: [pStartStr, pEndStr, targetHour, prevWin.prevStart, prevWin.prevEnd] }),
        ]);

        const curSessions = Number(sessCurRows?.[0]?.total || 0);
        const prevSessions = Number(sessPrevRows?.[0]?.total || 0);
        const curOrders = Number(ordCurRows?.[0]?.total || 0);
        const prevOrders = Number(ordPrevRows?.[0]?.total || 0);

        const curCVR = curSessions > 0 ? (curOrders / curSessions) : 0;
        const prevCVR = prevSessions > 0 ? (prevOrders / prevSessions) : 0;
        const diff_pp = (curCVR - prevCVR) * 100;
        const direction = diff_pp > 0.0001 ? 'up' : diff_pp < -0.0001 ? 'down' : 'flat';
        return res.json({
          metric: 'CVR_DELTA',
          range: { start, end },
          current: { total_orders: curOrders, total_sessions: curSessions, cvr: curCVR, cvr_percent: curCVR * 100 },
          previous: { total_orders: prevOrders, total_sessions: prevSessions, cvr: prevCVR, cvr_percent: prevCVR * 100 },
          diff_pp,
          direction,
          align: 'hour',
          hour: targetHour
        });
      }

      // Single-day align=hour (existing behavior)
      const targetHour = resolveTargetHour(target);

      // Sessions cumulative from hourly_sessions_summary
  const sqlSess = `SELECT COALESCE(SUM(COALESCE(adjusted_number_of_sessions, number_of_sessions)),0) AS total FROM hourly_sessions_summary WHERE date = ? AND hour <= ?`;

      // Orders cumulative from shopify_orders counting distinct order_name in IST window [00:00, hour+1)
      function buildIstWindow(dateStr, hour) {
        const y = Number(dateStr.slice(0, 4));
        const m = Number(dateStr.slice(5, 7));
        const d0 = Number(dateStr.slice(8, 10));
        const startUtcMs = Date.UTC(y, m - 1, d0, 0, 0, 0) - offsetMs; // IST midnight -> UTC
        const endUtcMs = startUtcMs + (hour + 1) * 3600_000; // exclusive end at next hour
        const startStr = new Date(startUtcMs).toISOString().slice(0,19).replace('T',' ');
        const endStr = new Date(endUtcMs).toISOString().slice(0,19).replace('T',' ');
        return { startStr, endStr };
      }
      const sqlOrders = `SELECT COUNT(DISTINCT order_name) AS cnt FROM shopify_orders WHERE created_at >= ? AND created_at < ?`;

      const [sessCurRows, sessPrevRows, ordersCurRows, ordersPrevRows] = await Promise.all([
        conn.query(sqlSess, { type: QueryTypes.SELECT, replacements: [target, targetHour] }),
        conn.query(sqlSess, { type: QueryTypes.SELECT, replacements: [prevStr, targetHour] }),
        (async () => {
          const { startStr, endStr } = buildIstWindow(target, targetHour);
          return conn.query(sqlOrders, { type: QueryTypes.SELECT, replacements: [startStr, endStr] });
        })(),
        (async () => {
          const { startStr, endStr } = buildIstWindow(prevStr, targetHour);
          return conn.query(sqlOrders, { type: QueryTypes.SELECT, replacements: [startStr, endStr] });
        })(),
      ]);

      const curSessions = Number(sessCurRows?.[0]?.total || 0);
      const prevSessions = Number(sessPrevRows?.[0]?.total || 0);
      const curOrders = Number(ordersCurRows?.[0]?.cnt || 0);
      const prevOrders = Number(ordersPrevRows?.[0]?.cnt || 0);

  const curCVR = curSessions > 0 ? (curOrders / curSessions) : 0;
      const prevCVR = prevSessions > 0 ? (prevOrders / prevSessions) : 0;
      const diff_pp = (curCVR - prevCVR) * 100;
      const direction = diff_pp > 0.0001 ? 'up' : diff_pp < -0.0001 ? 'down' : 'flat';
      return res.json({
        metric: 'CVR_DELTA',
        date: target,
        current: { total_orders: curOrders, total_sessions: curSessions, cvr: curCVR, cvr_percent: curCVR * 100 },
        previous: { total_orders: prevOrders, total_sessions: prevSessions, cvr: prevCVR, cvr_percent: prevCVR * 100 },
        diff_pp,
        direction,
        align: 'hour',
        hour: targetHour
      });
    }

    // Default day-based comparison
    const [current, previous] = await Promise.all([
      computeCVRForDay(target, conn),
      computeCVRForDay(prevStr, conn)
    ]);
    const diff_pp = (current.cvr_percent || 0) - (previous.cvr_percent || 0);
    const direction = diff_pp > 0.0001 ? 'up' : diff_pp < -0.0001 ? 'down' : 'flat';
    return res.json({
      metric: 'CVR_DELTA',
      date: target,
      current,
      previous,
      diff_pp, // percentage points
      direction
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Total Orders delta (vs previous day)
app.get('/metrics/total-orders-delta', requireAuth, brandContext, async (req, res) => {
  try {
    const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
    if (!parsed.success) return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
    const date = parsed.data.end || parsed.data.start;
    if (!date) return res.json({ metric: 'TOTAL_ORDERS_DELTA', date: null, current: null, previous: null, diff_pct: 0, direction: 'flat' });
    const delta = await deltaForSum('total_orders', date, req.brandDb.sequelize);
    return res.json({ metric: 'TOTAL_ORDERS_DELTA', date, ...delta });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Internal server error' }); }
});

// Total Sales delta (vs previous day) with optional align=hour
app.get('/metrics/total-sales-delta', requireAuth, brandContext, async (req, res) => {
  try {
    const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
    if (!parsed.success) return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
  const { start, end } = parsed.data;
  const date = end || start;
  if (!date && !(start && end)) return res.json({ metric: 'TOTAL_SALES_DELTA', date: null, current: null, previous: null, diff_pct: 0, direction: 'flat' });

    const compare = (req.query.compare || '').toString().toLowerCase();
    if (compare === 'prev-range-avg' && start && end) {
      const currAvg = await avgForRange('total_sales', { start, end, conn: req.brandDb.sequelize });
      const prevWin = previousWindow(start, end);
      const prevAvg = await avgForRange('total_sales', { start: prevWin.prevStart, end: prevWin.prevEnd, conn: req.brandDb.sequelize });
      const diff = currAvg - prevAvg;
      const diff_pct = prevAvg > 0 ? (diff / prevAvg) * 100 : (currAvg > 0 ? 100 : 0);
      const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
      return res.json({ metric: 'TOTAL_SALES_DELTA', range: { start, end }, current: currAvg, previous: prevAvg, diff_pct, direction, compare: 'prev-range-avg' });
    }

    const align = (req.query.align || '').toString().toLowerCase();
    if (align === 'hour') {
      const IST_OFFSET_MIN = 330;
      const nowUtc = new Date();
      const nowIst = new Date(nowUtc.getTime() + IST_OFFSET_MIN * 60 * 1000);
      const yyyy = nowIst.getUTCFullYear();
      const mm = String(nowIst.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(nowIst.getUTCDate()).padStart(2, '0');
      const todayIst = `${yyyy}-${mm}-${dd}`;

      // For past-only selections, use full-day (23) cutoff; if selection includes today, use current IST hour
      const resolveTargetHour = (rangeEndOrDate) => (rangeEndOrDate === todayIst ? nowIst.getUTCHours() : 23);

      if (start && end) {
        // If the range does not include today (end < today), compare full-day vs full-day; else align to current hour
        const targetHour = resolveTargetHour(end);
        const prevWin = previousWindow(start, end);
        const sqlRange = `SELECT COALESCE(SUM(total_sales),0) AS total FROM hour_wise_sales WHERE date >= ? AND date <= ? AND hour <= ?`;
        const [currRow, prevRow] = await Promise.all([
          req.brandDb.sequelize.query(sqlRange, { type: QueryTypes.SELECT, replacements: [start, end, targetHour] }),
          req.brandDb.sequelize.query(sqlRange, { type: QueryTypes.SELECT, replacements: [prevWin.prevStart, prevWin.prevEnd, targetHour] }),
        ]);
        const curr = Number(currRow?.[0]?.total || 0);
        const prevVal = Number(prevRow?.[0]?.total || 0);
        const diff = curr - prevVal;
        const diff_pct = prevVal > 0 ? (diff / prevVal) * 100 : (curr > 0 ? 100 : 0);
        const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
        return res.json({ metric: 'TOTAL_SALES_DELTA', range: { start, end }, current: curr, previous: prevVal, diff_pct, direction, align: 'hour', hour: targetHour });
      } else {
        // Single day selection: if not today, use full-day vs full-day
        const targetHour = resolveTargetHour(date);
        const prev = prevDayStr(date);
        const sql = `SELECT COALESCE(SUM(total_sales),0) AS total FROM hour_wise_sales WHERE date = ? AND hour <= ?`;
        const [currRow, prevRow] = await Promise.all([
          req.brandDb.sequelize.query(sql, { type: QueryTypes.SELECT, replacements: [date, targetHour] }),
          req.brandDb.sequelize.query(sql, { type: QueryTypes.SELECT, replacements: [prev, targetHour] }),
        ]);
        const curr = Number(currRow?.[0]?.total || 0);
        const prevVal = Number(prevRow?.[0]?.total || 0);
        const diff = curr - prevVal;
        const diff_pct = prevVal > 0 ? (diff / prevVal) * 100 : (curr > 0 ? 100 : 0);
        const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
        return res.json({ metric: 'TOTAL_SALES_DELTA', date, current: curr, previous: prevVal, diff_pct, direction, align: 'hour', hour: targetHour });
      }
    }

    const delta = await deltaForSum('total_sales', date, req.brandDb.sequelize);
    return res.json({ metric: 'TOTAL_SALES_DELTA', date, ...delta });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Internal server error' }); }
});

// Total Sessions delta (vs previous day)
app.get('/metrics/total-sessions-delta', requireAuth, brandContext, async (req, res) => {
  try {
    const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
    if (!parsed.success) return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
    const { start, end } = parsed.data;
    const date = end || start;
    if (!date && !(start && end)) return res.json({ metric: 'TOTAL_SESSIONS_DELTA', date: null, current: null, previous: null, diff_pct: 0, direction: 'flat' });

    const compare = (req.query.compare || '').toString().toLowerCase();
    if (compare === 'prev-range-avg' && start && end) {
      const currAvg = await avgForRange('total_sessions', { start, end, conn: req.brandDb.sequelize });
      const prevWin = previousWindow(start, end);
      const prevAvg = await avgForRange('total_sessions', { start: prevWin.prevStart, end: prevWin.prevEnd, conn: req.brandDb.sequelize });
      const diff = currAvg - prevAvg;
      const diff_pct = prevAvg > 0 ? (diff / prevAvg) * 100 : (currAvg > 0 ? 100 : 0);
      const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
      return res.json({ metric: 'TOTAL_SESSIONS_DELTA', range: { start, end }, current: currAvg, previous: prevAvg, diff_pct, direction, compare: 'prev-range-avg' });
    }

    const align = (req.query.align || '').toString().toLowerCase();
    if (align === 'hour') {
      const IST_OFFSET_MIN = 330;
      const nowUtc = new Date();
      const nowIst = new Date(nowUtc.getTime() + IST_OFFSET_MIN * 60 * 1000);
      const yyyy = nowIst.getUTCFullYear();
      const mm = String(nowIst.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(nowIst.getUTCDate()).padStart(2, '0');
      const todayIst = `${yyyy}-${mm}-${dd}`;
      const resolveTargetHour = (endOrDate) => (endOrDate === todayIst ? nowIst.getUTCHours() : 23);

      if (start && end) {
        const targetHour = resolveTargetHour(end);
        const prevWin = previousWindow(start, end);
  const sqlRange = `SELECT COALESCE(SUM(COALESCE(adjusted_number_of_sessions, number_of_sessions)),0) AS total FROM hourly_sessions_summary WHERE date >= ? AND date <= ? AND hour <= ?`;
        const [currRow, prevRow] = await Promise.all([
          req.brandDb.sequelize.query(sqlRange, { type: QueryTypes.SELECT, replacements: [start, end, targetHour] }),
          req.brandDb.sequelize.query(sqlRange, { type: QueryTypes.SELECT, replacements: [prevWin.prevStart, prevWin.prevEnd, targetHour] }),
        ]);
        const curr = Number(currRow?.[0]?.total || 0);
        const prevVal = Number(prevRow?.[0]?.total || 0);
        const diff = curr - prevVal;
        const diff_pct = prevVal > 0 ? (diff / prevVal) * 100 : (curr > 0 ? 100 : 0);
        const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
        return res.json({ metric: 'TOTAL_SESSIONS_DELTA', range: { start, end }, current: curr, previous: prevVal, diff_pct, direction, align: 'hour', hour: targetHour });
      } else {
        const targetHour = resolveTargetHour(date);
        const prev = prevDayStr(date);
  const sql = `SELECT COALESCE(SUM(COALESCE(adjusted_number_of_sessions, number_of_sessions)),0) AS total FROM hourly_sessions_summary WHERE date = ? AND hour <= ?`;
        const [currRow, prevRow] = await Promise.all([
          req.brandDb.sequelize.query(sql, { type: QueryTypes.SELECT, replacements: [date, targetHour] }),
          req.brandDb.sequelize.query(sql, { type: QueryTypes.SELECT, replacements: [prev, targetHour] }),
        ]);
        const curr = Number(currRow?.[0]?.total || 0);
        const prevVal = Number(prevRow?.[0]?.total || 0);
        const diff = curr - prevVal;
        const diff_pct = prevVal > 0 ? (diff / prevVal) * 100 : (curr > 0 ? 100 : 0);
        const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
        return res.json({ metric: 'TOTAL_SESSIONS_DELTA', date, current: curr, previous: prevVal, diff_pct, direction, align: 'hour', hour: targetHour });
      }
    }

    const d = await deltaForSum('total_sessions', date, req.brandDb.sequelize);
    return res.json({ metric: 'TOTAL_SESSIONS_DELTA', date, ...d });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Internal server error' }); }
});

// ATC Sessions delta (vs previous day)
app.get('/metrics/atc-sessions-delta', requireAuth, brandContext, async (req, res) => {
  try {
    const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
    if (!parsed.success) return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
    const { start, end } = parsed.data;
    const date = end || start;
    if (!date && !(start && end)) return res.json({ metric: 'ATC_SESSIONS_DELTA', date: null, current: null, previous: null, diff_pct: 0, direction: 'flat' });

    const compare = (req.query.compare || '').toString().toLowerCase();
    if (compare === 'prev-range-avg' && start && end) {
      const currAvg = await avgForRange('total_atc_sessions', { start, end, conn: req.brandDb.sequelize });
      const prevWin = previousWindow(start, end);
      const prevAvg = await avgForRange('total_atc_sessions', { start: prevWin.prevStart, end: prevWin.prevEnd, conn: req.brandDb.sequelize });
      const diff = currAvg - prevAvg;
      const diff_pct = prevAvg > 0 ? (diff / prevAvg) * 100 : (currAvg > 0 ? 100 : 0);
      const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
      return res.json({ metric: 'ATC_SESSIONS_DELTA', range: { start, end }, current: currAvg, previous: prevAvg, diff_pct, direction, compare: 'prev-range-avg' });
    }

    const align = (req.query.align || '').toString().toLowerCase();
    if (align === 'hour') {
      const IST_OFFSET_MIN = 330;
      const nowUtc = new Date();
      const nowIst = new Date(nowUtc.getTime() + IST_OFFSET_MIN * 60 * 1000);
      const yyyy = nowIst.getUTCFullYear();
      const mm = String(nowIst.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(nowIst.getUTCDate()).padStart(2, '0');
      const todayIst = `${yyyy}-${mm}-${dd}`;
      const resolveTargetHour = (endOrDate) => (endOrDate === todayIst ? nowIst.getUTCHours() : 23);

      if (start && end) {
        const targetHour = resolveTargetHour(end);
        const prevWin = previousWindow(start, end);
        const sqlRange = `SELECT COALESCE(SUM(number_of_atc_sessions),0) AS total FROM hourly_sessions_summary WHERE date >= ? AND date <= ? AND hour <= ?`;
        const [currRow, prevRow] = await Promise.all([
          req.brandDb.sequelize.query(sqlRange, { type: QueryTypes.SELECT, replacements: [start, end, targetHour] }),
          req.brandDb.sequelize.query(sqlRange, { type: QueryTypes.SELECT, replacements: [prevWin.prevStart, prevWin.prevEnd, targetHour] }),
        ]);
        const curr = Number(currRow?.[0]?.total || 0);
        const prevVal = Number(prevRow?.[0]?.total || 0);
        const diff = curr - prevVal;
        const diff_pct = prevVal > 0 ? (diff / prevVal) * 100 : (curr > 0 ? 100 : 0);
        const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
        return res.json({ metric: 'ATC_SESSIONS_DELTA', range: { start, end }, current: curr, previous: prevVal, diff_pct, direction, align: 'hour', hour: targetHour });
      } else {
        const targetHour = resolveTargetHour(date);
        const prev = prevDayStr(date);
        const sql = `SELECT COALESCE(SUM(number_of_atc_sessions),0) AS total FROM hourly_sessions_summary WHERE date = ? AND hour <= ?`;
        const [currRow, prevRow] = await Promise.all([
          req.brandDb.sequelize.query(sql, { type: QueryTypes.SELECT, replacements: [date, targetHour] }),
          req.brandDb.sequelize.query(sql, { type: QueryTypes.SELECT, replacements: [prev, targetHour] }),
        ]);
        const curr = Number(currRow?.[0]?.total || 0);
        const prevVal = Number(prevRow?.[0]?.total || 0);
        const diff = curr - prevVal;
        const diff_pct = prevVal > 0 ? (diff / prevVal) * 100 : (curr > 0 ? 100 : 0);
        const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
        return res.json({ metric: 'ATC_SESSIONS_DELTA', date, current: curr, previous: prevVal, diff_pct, direction, align: 'hour', hour: targetHour });
      }
    }

    const d = await deltaForSum('total_atc_sessions', date, req.brandDb.sequelize);
    return res.json({ metric: 'ATC_SESSIONS_DELTA', date, ...d });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Internal server error' }); }
});

// AOV delta (vs previous day)
app.get('/metrics/aov-delta', requireAuth, brandContext, async (req, res) => {
  try {
    const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
    if (!parsed.success) return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
    const { start, end } = parsed.data;
    const date = end || start;
    if (!date && !(start && end)) return res.json({ metric: 'AOV_DELTA', date: null, current: null, previous: null, diff_pct: 0, direction: 'flat' });

    const compare = (req.query.compare || '').toString().toLowerCase();
    if (compare === 'prev-range-avg' && start && end) {
      const curr = await aovForRange({ start, end, conn: req.brandDb.sequelize });
      const prevWin = previousWindow(start, end);
      const prev = await aovForRange({ start: prevWin.prevStart, end: prevWin.prevEnd, conn: req.brandDb.sequelize });
      const diff = curr - prev;
      const diff_pct = prev > 0 ? (diff / prev) * 100 : (curr > 0 ? 100 : 0);
      const direction = diff > 0.0001 ? 'up' : diff < -0.0001 ? 'down' : 'flat';
      return res.json({ metric: 'AOV_DELTA', range: { start, end }, current: curr, previous: prev, diff_pct, direction, compare: 'prev-range-avg' });
    }

    const d = await deltaForAOV(date, req.brandDb.sequelize);
    return res.json({ metric: 'AOV_DELTA', date, ...d });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Internal server error' }); }
});

// GET /metrics/total-sales?start=YYYY-MM-DD&end=YYYY-MM-DD
app.get("/metrics/total-sales", requireAuth, brandContext, async (req, res) => {
  try {
    const parsed = RangeSchema.safeParse({
      start: req.query.start,
      end: req.query.end,
    });
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid date range", details: parsed.error.flatten() });
    }
    const { start, end } = parsed.data;

  const total_sales = await computeTotalSales({ start, end, conn: req.brandDb.sequelize });

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
app.get("/metrics/total-orders", requireAuth, brandContext, async (req, res) => {
  try {
    const parsed = RangeSchema.safeParse({
      start: req.query.start,
      end: req.query.end,
    });
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid date range", details: parsed.error.flatten() });
    }
    const { start, end } = parsed.data;

  const total_orders = await computeTotalOrders({ start, end, conn: req.brandDb.sequelize });

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
app.get("/metrics/funnel-stats", requireAuth, brandContext, async (req, res) => {
  try {
    const parsed = RangeSchema.safeParse({
      start: req.query.start,
      end: req.query.end,
    });
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid date range", details: parsed.error.flatten() });
    }
    const { start, end } = parsed.data;

  const stats = await computeFunnelStats({ start, end, conn: req.brandDb.sequelize });

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

// Per-brand last updated (uses brand DB)
app.get('/external/last-updated/pts', requireAuth, brandContext, async (req, res) => {
  try {
    if (!lastUpdatedCache[req.brandKey]) {
      lastUpdatedCache[req.brandKey] = { data: null, fetchedAt: 0 };
    }
    const cacheEntry = lastUpdatedCache[req.brandKey];
    const now = Date.now();
    if (cacheEntry.data && now - cacheEntry.fetchedAt < 30_000) {
      return res.json(cacheEntry.data);
    }

    const rows = await req.brandDb.sequelize.query(
      "SELECT key_value FROM pipeline_metadata WHERE key_name = 'last_pipeline_completion_time' LIMIT 1",
      { type: QueryTypes.SELECT }
    );

    const rawTs = rows?.[0]?.key_value ?? null;

    let iso = null;
    let legacy = null; // "YYYY-MM-DD HH:MM:SS"

    if (rawTs instanceof Date) {
      // DB gave us a Date object (UTC is safest to display)
      iso = rawTs.toISOString();
      legacy = iso.replace('T', ' ').replace('Z', '').slice(0, 19);
    } else if (typeof rawTs === 'string' && rawTs.trim()) {
      // If it's "YYYY-MM-DD HH:MM:SS", treat as UTC
      const looksLegacy = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(rawTs);
      const parsed = looksLegacy ? new Date(rawTs.replace(' ', 'T') + 'Z') : new Date(rawTs);
      if (!isNaN(parsed.valueOf())) {
        iso = parsed.toISOString();
        legacy = looksLegacy ? rawTs : iso.replace('T', ' ').replace('Z', '').slice(0, 19);
      } else {
        console.warn('[last-updated] Unparseable timestamp string:', rawTs);
        legacy = rawTs; // pass through unmodified
      }
    } else if (typeof rawTs === 'number') {
      // epoch ms (or seconds) – normalize
      const ms = rawTs > 1e12 ? rawTs : rawTs * 1000;
      const d = new Date(ms);
      iso = d.toISOString();
      legacy = iso.replace('T', ' ').replace('Z', '').slice(0, 19);
    } else if (rawTs == null) {
      console.warn('[last-updated] No row found in pipeline_metadata for last_pipeline_completion_time');
    } else {
      console.warn('[last-updated] Unexpected key_value type:', typeof rawTs);
    }

    const payload = {
      "Last successful run completed at": legacy, // keep legacy key
      iso,
      timezone: 'IST'
    };

  cacheEntry.data = payload;
  cacheEntry.fetchedAt = now;

    res.set('Cache-Control', 'public, max-age=15');
    return res.json(payload);
  } catch (e) {
    console.error('Error fetching last updated from DB', e);
    const msg = process.env.NODE_ENV === 'production' ? 'Failed to read last updated' : (e?.message || 'Failed');
    return res.status(500).json({ error: msg });
  }
});


// --- NEW: GET /metrics/order-split?start=YYYY-MM-DD&end=YYYY-MM-DD
// Returns COD vs Prepaid vs Partially paid split (counts and percentages) over the date range.
app.get("/metrics/order-split", requireAuth, brandContext, async (req, res) => {
  try {
    const parsed = RangeSchema.safeParse({
      start: req.query.start,
      end: req.query.end,
    });
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid date range", details: parsed.error.flatten() });
    }
    const { start, end } = parsed.data;

    const [cod_orders, prepaid_orders, partially_paid_orders] = await Promise.all([
      rawSum("cod_orders", { start, end, conn: req.brandDb.sequelize }),
      rawSum("prepaid_orders", { start, end, conn: req.brandDb.sequelize }),
      rawSum("partially_paid_orders", { start, end, conn: req.brandDb.sequelize }),
    ]);

    const total = cod_orders + prepaid_orders + partially_paid_orders;
    const cod_percent = total > 0 ? (cod_orders / total) * 100 : 0;
    const prepaid_percent = total > 0 ? (prepaid_orders / total) * 100 : 0;
    const partially_paid_percent = total > 0 ? (partially_paid_orders / total) * 100 : 0;

    return res.json({
      metric: "ORDER_SPLIT",
      range: { start: start || null, end: end || null },
      cod_orders,
      prepaid_orders,
      partially_paid_orders,
      total_orders_from_split: total,
      cod_percent,
      prepaid_percent,
      partially_paid_percent,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// --- NEW: GET /metrics/payment-sales-split?start=YYYY-MM-DD&end=YYYY-MM-DD
// Returns COD vs Prepaid vs Partially-paid (Gokwik PPCOD) sales (sum of order max total_price) and percentages.
app.get('/metrics/payment-sales-split', requireAuth, brandContext, async (req, res) => {
  try {
    const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
    }
    const { start, end } = parsed.data;

    // Build time window using sargable predicates (avoid DATE() on column)
    // If only start is provided treat end=start. If neither provided return zeros.
    if (!start && !end) {
      return res.json({
        metric: 'PAYMENT_SPLIT_SALES',
        range: { start: null, end: null },
        cod_sales: 0,
        prepaid_sales: 0,
        partial_sales: 0,
        total_sales_from_split: 0,
        cod_percent: 0,
        prepaid_percent: 0,
        partial_percent: 0,
      });
    }
    const effectiveStart = start || end; // if only end provided
    const effectiveEnd = end || start;   // if only start provided
    const startTs = `${effectiveStart} 00:00:00`;
    const endTsExclusive = new Date(`${effectiveEnd}T00:00:00Z`);
    endTsExclusive.setUTCDate(endTsExclusive.getUTCDate() + 1);
    const endTs = endTsExclusive.toISOString().slice(0,19).replace('T',' ');

    // Query: collapse duplicate order rows by taking max(total_price) per order_name
    const sql = `
      SELECT payment_type, SUM(max_price) AS sales
      FROM (
        SELECT 
          CASE 
            WHEN payment_gateway_names LIKE '%Gokwik PPCOD%' THEN 'Partial'
            WHEN payment_gateway_names LIKE '%Cash on Delivery (COD)%' OR payment_gateway_names LIKE '%cash_on_delivery%' OR payment_gateway_names LIKE '%cash_on_delivery%' OR payment_gateway_names IS NULL OR payment_gateway_names = '' THEN 'COD'
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
    try {
      rows = await req.brandDb.sequelize.query(sql, { type: QueryTypes.SELECT, replacements: [startTs, endTs] });
    } catch (e) {
      console.error('[payment-sales-split] query failed', e.message);
      // Return safe zeros (don't leak internal error in production)
      return res.json({
        metric: 'PAYMENT_SPLIT_SALES',
        range: { start: effectiveStart, end: effectiveEnd },
        cod_sales: 0,
        prepaid_sales: 0,
        partial_sales: 0,
        total_sales_from_split: 0,
        cod_percent: 0,
        prepaid_percent: 0,
        partial_percent: 0,
        warning: 'Query failed'
      });
    }

    let cod_sales = 0; let prepaid_sales = 0; let partial_sales = 0;
    for (const r of rows) {
      if (r.payment_type === 'COD') cod_sales = Number(r.sales || 0);
      else if (r.payment_type === 'Prepaid') prepaid_sales = Number(r.sales || 0);
      else if (r.payment_type === 'Partial') partial_sales = Number(r.sales || 0);
    }
    const total = cod_sales + prepaid_sales + partial_sales;
    const cod_percent = total > 0 ? (cod_sales / total) * 100 : 0;
    const prepaid_percent = total > 0 ? (prepaid_sales / total) * 100 : 0;
    const partial_percent = total > 0 ? (partial_sales / total) * 100 : 0;

    return res.json({
      metric: 'PAYMENT_SPLIT_SALES',
      range: { start: effectiveStart, end: effectiveEnd },
      cod_sales,
      prepaid_sales,
      partial_sales,
      total_sales_from_split: total,
      cod_percent,
      prepaid_percent,
      partial_percent,
      sql_used: process.env.NODE_ENV === 'production' ? undefined : sql
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Hourly trend data across sales, sessions, CVR, and ATC sessions
app.get('/metrics/hourly-trend', requireAuth, brandContext, async (req, res) => {
  try {
    const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
    }
    const { start, end } = parsed.data;
    if (!start || !end) {
      return res.status(400).json({ error: 'Both start and end dates are required' });
    }
    if (start > end) {
      return res.status(400).json({ error: 'Start date must be on or before end date' });
    }

    // Optional aggregation mode: when aggregate=avg-by-hour (aliases: avg-hour, avg)
    // we will return the average metrics for each hour-of-day across the selected range
    // instead of a continuous hour series for every day.
    const aggregate = (req.query.aggregate || '').toString().toLowerCase();

    const IST_OFFSET_MIN = 330;
    const offsetMs = IST_OFFSET_MIN * 60 * 1000;
    const nowIst = new Date(Date.now() + offsetMs);
    const todayIst = `${nowIst.getUTCFullYear()}-${String(nowIst.getUTCMonth() + 1).padStart(2, '0')}-${String(nowIst.getUTCDate()).padStart(2, '0')}`;
    const currentHourIst = nowIst.getUTCHours();
    const alignHourRaw = end === todayIst ? currentHourIst : 23;
    const alignHour = Math.max(0, Math.min(23, alignHourRaw));

    const rows = await req.brandDb.sequelize.query(
      `SELECT date, hour, total_sales, number_of_orders,
        COALESCE(adjusted_number_of_sessions, number_of_sessions) AS number_of_sessions,
        number_of_atc_sessions
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

    const startDate = new Date(`${start}T00:00:00Z`);
    const endDate = new Date(`${end}T00:00:00Z`);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Unable to parse date range' });
    }

    const DAY_MS = 24 * 3600_000;
    let points = [];

    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    if (aggregate === 'avg-by-hour' || aggregate === 'avg-hour' || aggregate === 'avg') {
      // Build bucket list respecting alignHour for the last (possibly partial) day
      const buckets = [];
      for (let ts = startDate.getTime(); ts <= endDate.getTime(); ts += DAY_MS) {
        const dt = new Date(ts);
        const yyyy = dt.getUTCFullYear();
        const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(dt.getUTCDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;
        const maxHour = dateStr === end ? alignHour : 23;
        for (let hour = 0; hour <= maxHour; hour += 1) buckets.push({ date: dateStr, hour });
      }

      // Accumulate by hour-of-day
      const hourAcc = Array.from({ length: 24 }, () => ({ count: 0, sales: 0, sessions: 0, orders: 0, atc: 0 }));
      for (const { date: d, hour } of buckets) {
        const metrics = rowMap.get(`${d}#${hour}`) || { sales: 0, sessions: 0, orders: 0, atc: 0 };
        const acc = hourAcc[hour];
        acc.count += 1;
        acc.sales += metrics.sales;
        acc.sessions += metrics.sessions;
        acc.orders += metrics.orders;
        acc.atc += metrics.atc;
      }

      const maxHourForSeries = end === todayIst ? alignHour : 23;
      points = Array.from({ length: maxHourForSeries + 1 }, (_, hour) => {
        const acc = hourAcc[hour];
        const avgSales = acc.count ? acc.sales / acc.count : 0;
        const avgSessions = acc.count ? acc.sessions / acc.count : 0;
        const avgOrders = acc.count ? acc.orders / acc.count : 0;
        const avgAtc = acc.count ? acc.atc / acc.count : 0;
        const cvrRatio = acc.sessions > 0 ? acc.orders / acc.sessions : 0;
        const label = `${String(hour).padStart(2, '0')}:00`;
        return {
          hour,
          label,
          metrics: {
            sales: avgSales,
            sessions: avgSessions,
            orders: avgOrders,
            atc: avgAtc,
            cvr_ratio: cvrRatio,
            cvr_percent: cvrRatio * 100,
          }
        };
      });
    } else {
      // Default behavior: continuous series per hour per day
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

      points = buckets.map(({ date: bucketDate, hour }) => {
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
    }

    const prevWin = previousWindow(start, end);
    let comparison = null;
    if (prevWin?.prevStart && prevWin?.prevEnd) {
      const comparisonAlignHour = end === todayIst ? alignHour : 23;
      const comparisonRows = await req.brandDb.sequelize.query(
  `SELECT date, hour, total_sales, number_of_orders,
    COALESCE(adjusted_number_of_sessions, number_of_sessions) AS number_of_sessions,
    number_of_atc_sessions
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

      // For comparison, always compute avg-by-hour to create the dotted series aligned by hour
      const comparisonBuckets = [];
      for (let ts = parseIsoDate(prevWin.prevStart).getTime(); ts <= parseIsoDate(prevWin.prevEnd).getTime(); ts += DAY_MS) {
        const dt = new Date(ts);
        const yyyy = dt.getUTCFullYear();
        const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(dt.getUTCDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;
        const maxHour = dateStr === prevWin.prevEnd ? comparisonAlignHour : 23;
        for (let hour = 0; hour <= maxHour; hour += 1) comparisonBuckets.push({ date: dateStr, hour });
      }

      const hourAcc = Array.from({ length: 24 }, () => ({ count: 0, sales: 0, sessions: 0, orders: 0, atc: 0 }));
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
        const avgSales = acc.count ? acc.sales / acc.count : 0;
        const avgSessions = acc.count ? acc.sessions / acc.count : 0;
        const avgOrders = acc.count ? acc.orders / acc.count : 0;
        const avgAtc = acc.count ? acc.atc / acc.count : 0;
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

      // Align comparison points to current points' hours
      const baseHours = points.map(p => p.hour);
      const comparisonPoints = baseHours.map((hour) => {
        const avg = avgByHour[hour] || { sales: 0, sessions: 0, orders: 0, atc: 0, cvr_ratio: 0, cvr_percent: 0 };
        return { hour, label: `${String(hour).padStart(2,'0')}:00`, metrics: avg };
      });

      comparison = {
        range: { start: prevWin.prevStart, end: prevWin.prevEnd },
        alignHour: comparisonAlignHour,
        points: comparisonPoints,
        hourSampleCount: hourAcc.map((acc) => acc.count),
      };
    }

    return res.json({
      range: { start, end },
      timezone: 'IST',
      alignHour,
      points,
      comparison,
    });
  } catch (e) {
    console.error('[hourly-trend] failed', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Daily trend (aggregated by calendar day) for sales, sessions, orders, ATC; includes comparison to previous window
app.get('/metrics/daily-trend', requireAuth, brandContext, async (req, res) => {
  try {
    const parsed = RangeSchema.safeParse({ start: req.query.start, end: req.query.end });
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid date range', details: parsed.error.flatten() });
    }
    const { start, end } = parsed.data;
    if (!start || !end) return res.status(400).json({ error: 'Both start and end dates are required' });
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
             SUM(COALESCE(adjusted_number_of_sessions, number_of_sessions)) AS sessions,
             SUM(number_of_atc_sessions) AS atc
      FROM hour_wise_sales
      WHERE date >= ? AND date <= ?
      GROUP BY date
      ORDER BY date ASC`;
    const rows = await req.brandDb.sequelize.query(sql, { type: QueryTypes.SELECT, replacements: [start, end] });
    const map = new Map(rows.map(r => [r.date, {
      sales: Number(r.sales || 0),
      orders: Number(r.orders || 0),
      sessions: Number(r.sessions || 0),
      atc: Number(r.atc || 0),
    }]));
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
      const pMap = new Map(pRows.map(r => [r.date, {
        sales: Number(r.sales || 0),
        orders: Number(r.orders || 0),
        sessions: Number(r.sessions || 0),
        atc: Number(r.atc || 0),
      }]));
      const pDays = pDayList.map(d => {
        const m = pMap.get(d) || { sales: 0, orders: 0, sessions: 0, atc: 0 };
        const cvr = m.sessions > 0 ? m.orders / m.sessions : 0;
        return { date: d, label: d, metrics: { ...m, cvr_ratio: cvr, cvr_percent: cvr * 100 } };
      });
      comparison = { range: { start: prevWin.prevStart, end: prevWin.prevEnd }, days: pDays };
    }

    return res.json({ range: { start, end }, timezone: 'IST', days, comparison });
  } catch (e) {
    console.error('[daily-trend] failed', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// --- NEW: GET /metrics/hourly-sales-compare?hours=6
// Returns aligned arrays for the last N hours (default 6) and the same hours yesterday.
app.get('/metrics/hourly-sales-compare', requireAuth, brandContext, async (req, res) => {
  try {
    const hoursParam = Number(req.query.hours || 6);
    const N = Math.max(1, Math.min(12, isFinite(hoursParam) ? Math.floor(hoursParam) : 6));

    // Use IST (UTC+5:30) for bucketing and labels
    const IST_OFFSET_MIN = 330; // minutes
    const offsetMs = IST_OFFSET_MIN * 60 * 1000;

    // Current time in IST, floored to the start of the hour (in IST)
    const nowUtc = new Date();
    const nowIst = new Date(nowUtc.getTime() + offsetMs);
    nowIst.setUTCMinutes(0, 0, 0);

    // Build last N hourly buckets in IST
    const bucketsIst = [];
    for (let i = N - 1; i >= 0; i--) {
      const ist = new Date(nowIst.getTime() - i * 3600_000);
      const yyyy = ist.getUTCFullYear();
      const mm = String(ist.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(ist.getUTCDate()).padStart(2, '0');
      const hour = ist.getUTCHours(); // hour in IST space
      bucketsIst.push({ date: `${yyyy}-${mm}-${dd}`, hour });
    }
    // Same hours yesterday (in IST space)
    const yBucketsIst = bucketsIst.map(b => {
      const ist = new Date(Date.UTC(
        Number(b.date.slice(0, 4)),
        Number(b.date.slice(5, 7)) - 1,
        Number(b.date.slice(8, 10)),
        b.hour, 0, 0, 0
      ));
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
    for (const r of rowsCurrent) {
      const k = `${r.date}#${r.hour}`;
      mapCurrent.set(k, Number(r.total_sales || 0));
    }
    const mapY = new Map();
    for (const r of rowsY) {
      const k = `${r.date}#${r.hour}`;
      mapY.set(k, Number(r.total_sales || 0));
    }

    const labels = bucketsIst.map(b => `${String(b.hour).padStart(2, '0')}:00`);
    const current = bucketsIst.map(b => mapCurrent.get(`${b.date}#${b.hour}`) || 0);
    const yesterday = yBucketsIst.map(b => mapY.get(`${b.date}#${b.hour}`) || 0);

    return res.json({ labels, series: { current, yesterday }, tz: 'IST' });
  } catch (e) {
    console.error('[hourly-sales-compare] failed', e);
    return res.status(500).json({ error: 'Internal server error' });
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
  // Ensure author tables exist if not created via manual DDL
  try { await SessionAdjustmentBucket.sync(); } catch (e) { console.warn('Bucket sync skipped', e?.message); }
  try { await SessionAdjustmentAudit.sync(); } catch (e) { console.warn('Audit sync skipped', e?.message); }
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