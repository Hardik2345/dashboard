// Force production mode by default when running the server from this codebase.
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}
const express = require("express");
const cors = require("cors");
const session = require('express-session');
const { RedisStore } = require('connect-redis');
const SequelizeStoreFactory = require('connect-session-sequelize');
const passport = require('passport');
const logger = require('./utils/logger');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const helmet = require('helmet');
const { Sequelize, DataTypes, QueryTypes } = require("sequelize");
const { createAccessControlService } = require('./services/accessControlService');
const { createSessionActivityService } = require('./services/sessionActivityService');
const { buildAuthRouter } = require('./routes/auth');
const { buildActivityRouter } = require('./routes/activity');
const { buildAccessControlRouter } = require('./routes/accessControl');
const { buildAuthorRouter } = require('./routes/author');
const { buildAuthorBrandsRouter } = require('./routes/authorBrands');
const { buildAdjustmentBucketsRouter } = require('./routes/adjustmentBuckets');
const { buildAdjustmentsRouter } = require('./routes/adjustments');
const { buildAlertsRouter } = require('./routes/alerts');
const { buildMetricsRouter } = require('./routes/metrics');
const { buildExternalRouter } = require('./routes/external');
const { buildUploadsRouter } = require('./routes/uploads');
const { buildApiKeysRouter } = require('./routes/apiKeys');
const { buildShopifyRouter } = require('./routes/shopify');
const { buildWebhooksRouter } = require('./routes/webhooks');
const { buildNotificationsRouter } = require('./routes/notifications'); // [NEW]

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
// Increase JSON body size limit to handle base64-encoded file uploads (default is 100KB)
app.use(express.json({ limit: '60mb' }));
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1); // so secure cookies work behind reverse proxy / load balancer
}

// ---- DB: Sequelize -----------------------------------------------------------
const DB_HOST = process.env.DB_PROXY_HOST || process.env.DB_HOST;
const DB_PORT = Number(process.env.DB_PROXY_PORT || process.env.DB_PORT || 3306);

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: DB_HOST,
    port: DB_PORT,
    dialect: "mysql",
    dialectModule: require("mysql2"),
    // NOTE: keep timezone if you need it for DATETIME columns. It doesn't affect DATEONLY reads,
    // but we still remove ORM ambiguity by using raw SQL for date filters.
    timezone: "+00:00",
    pool: {
      max: Number(process.env.DB_POOL_MAX || 1),  // keep tiny when using RDS Proxy
      min: Number(process.env.DB_POOL_MIN || 0),
      idle: Number(process.env.DB_POOL_IDLE || 2000),
      acquire: Number(process.env.DB_POOL_ACQUIRE || 30000),
      evict: Number(process.env.DB_POOL_EVICT || 1000),
    },
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      },
      connectAttributes: {
        program_name: 'dashboard-main',
        service: 'dashboard-api',
        env: process.env.NODE_ENV || 'development',
      },
    },
  }
);

// ---- Models ------------------------------------------------------------------
// Important: use DATEONLY for a DATE column
sequelize.define(
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

const Alert = sequelize.define('alerts', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  brand_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  name: { type: DataTypes.STRING(255), allowNull: false },
  metric_name: { type: DataTypes.STRING(255), allowNull: true },
  metric_type: { type: DataTypes.ENUM('base', 'derived'), allowNull: false, defaultValue: 'base' },
  formula: { type: DataTypes.TEXT, allowNull: true },
  threshold_type: { type: DataTypes.ENUM('absolute', 'percentage_drop', 'percentage_rise', 'less_than', 'more_than', 'greater_than'), allowNull: false },
  threshold_value: { type: DataTypes.DOUBLE, allowNull: false },
  critical_threshold: { type: DataTypes.FLOAT, allowNull: true },
  severity: { type: DataTypes.ENUM('low', 'medium', 'high'), allowNull: false, defaultValue: 'low' },
  cooldown_minutes: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 30 },
  is_active: { type: DataTypes.TINYINT, allowNull: true, defaultValue: 1 },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  lookback_days: { type: DataTypes.INTEGER, allowNull: true },
  have_recipients: { type: DataTypes.TINYINT, allowNull: true, defaultValue: 0 },
  quiet_hours_start: { type: DataTypes.INTEGER, allowNull: true },
  quiet_hours_end: { type: DataTypes.INTEGER, allowNull: true },
  last_triggered_at: { type: DataTypes.DATE, allowNull: true }
}, { tableName: 'alerts', timestamps: false });

const AlertChannel = sequelize.define('alert_channels', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  alert_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  brand_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  channel_type: { type: DataTypes.ENUM('slack', 'email', 'webhook'), allowNull: false },
  channel_config: { type: DataTypes.JSON, allowNull: false },
}, { tableName: 'alert_channels', timestamps: false });

// Brand-level alert channel configuration
const BrandAlertChannel = sequelize.define('brands_alert_channel', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  brand_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, unique: true },
  channel_type: { type: DataTypes.ENUM('slack', 'email', 'webhook'), allowNull: false },
  channel_config: { type: DataTypes.JSON, allowNull: false },
  is_active: { type: DataTypes.TINYINT, allowNull: true, defaultValue: 1 },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
}, { tableName: 'brands_alert_channel', timestamps: false });

// --- Access control (master DB) ---------------------------------------------
// Tables are created idempotently on startup (MySQL CREATE TABLE IF NOT EXISTS)
sequelize.define('access_control_settings', {
  id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
  mode: { type: DataTypes.ENUM('domain','whitelist'), allowNull: false, defaultValue: 'domain' },
  auto_provision_brand_user: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
  updated_by: { type: DataTypes.BIGINT, allowNull: true },
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
}, { tableName: 'access_control_settings', timestamps: false });

sequelize.define('access_whitelist_emails', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  brand_key: { type: DataTypes.STRING(32), allowNull: true },
  notes: { type: DataTypes.STRING(255), allowNull: true },
  added_by: { type: DataTypes.BIGINT, allowNull: true },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
}, { tableName: 'access_whitelist_emails', timestamps: false });

sequelize.define('session_activity', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  brand_key: { type: DataTypes.STRING(32), allowNull: false },
  user_email: { type: DataTypes.STRING(255), allowNull: false },
  bucket_start: { type: DataTypes.DATE, allowNull: false },
  hit_count: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
  first_seen: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  last_seen: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  user_agent: { type: DataTypes.STRING(255), allowNull: true },
  ip_hash: { type: DataTypes.CHAR(64), allowNull: true },
  meta_json: { type: DataTypes.JSON, allowNull: true }
}, {
  tableName: 'session_activity',
  timestamps: false,
  indexes: [
    { unique: true, fields: ['brand_key', 'user_email', 'bucket_start'], name: 'uq_brand_user_bucket' },
    { fields: ['brand_key', 'bucket_start'], name: 'idx_brand_bucket' },
    { fields: ['brand_key', 'last_seen'], name: 'idx_brand_last_seen' }
  ]
});

// API Keys model (for managing API keys for brands)
sequelize.define('api_keys', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(255), allowNull: false },
  brand_key: { type: DataTypes.STRING(32), allowNull: false },
  key_hash: { type: DataTypes.STRING(255), allowNull: false }, // bcrypt hash
  sha256_hash: { type: DataTypes.CHAR(64), allowNull: false, unique: true }, // SHA256 for fast lookup
  permissions: { type: DataTypes.JSON, allowNull: true }, // e.g. ["upload:files", "read:files"]
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  last_used_at: { type: DataTypes.DATE, allowNull: true },
  expires_at: { type: DataTypes.DATE, allowNull: true },
  is_active: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
  revoked_at: { type: DataTypes.DATE, allowNull: true },
  created_by_email: { type: DataTypes.STRING(255), allowNull: true },
}, {
  tableName: 'api_keys',
  timestamps: false,
  indexes: [
    { fields: ['brand_key'], name: 'idx_brand_key' },
    { fields: ['sha256_hash'], name: 'idx_sha256_hash' },
    { fields: ['is_active'], name: 'idx_is_active' },
  ]
});

const { resolveBrandFromEmail, getBrands } = require('./config/brands');
const { getBrandConnection } = require('./lib/brandConnectionManager');
const redisClient = require('./lib/redis');

async function fetchBrandUserByEmail(brandConn, email) {
  const rows = await brandConn.sequelize.query(
    'SELECT id, email, password_hash, role, is_active FROM users WHERE email = ? LIMIT 1',
    { type: QueryTypes.SELECT, replacements: [email] }
  );
  return Array.isArray(rows) ? rows[0] : rows;
}

async function fetchBrandUserById(brandConn, id) {
  const rows = await brandConn.sequelize.query(
    'SELECT id, email, password_hash, role, is_active FROM users WHERE id = ? LIMIT 1',
    { type: QueryTypes.SELECT, replacements: [id] }
  );
  return Array.isArray(rows) ? rows[0] : rows;
}

async function createBrandUser(brandConn, { email, password_hash, role = 'user', is_active = true }) {
  try {
    await brandConn.sequelize.query(
      'INSERT INTO users (email, password_hash, role, is_active, createdAt, updatedAt) VALUES (?, ?, ?, ?, NOW(), NOW())',
      { type: QueryTypes.INSERT, replacements: [email, password_hash, role, is_active ? 1 : 0] }
    );
  } catch (_) {
    // Ignore duplicate errors and fall back to fetch
  }
  return fetchBrandUserByEmail(brandConn, email);
}

// ---- Session & Passport -----------------------------------------------------
const SequelizeStore = SequelizeStoreFactory(session.Store);
const redisStore = redisClient ? new RedisStore({ client: redisClient, prefix: 'sess:' }) : null;
const sessionStore = redisStore || new SequelizeStore({ db: sequelize, tableName: 'sessions' });
logger.info('Using session store:', redisStore ? 'RedisStore' : 'SequelizeStore');

const isProd = process.env.NODE_ENV === 'production';
// Default to cross-site=true so SameSite=None/secure cookies work when frontend is on a different host (e.g., Vercel -> Render).
const crossSite = String(process.env.CROSS_SITE || 'true').toLowerCase() === 'true';
const sessionTrackingEnabled = String(process.env.SESSION_TRACKING_ENABLED || 'false').toLowerCase() === 'true';
const SESSION_BUCKET_MS = 10 * 60 * 1000; // 10 minutes
const accessControlService = createAccessControlService(sequelize);
const { ensureAccessControlTables, getAccessSettings, bustAccessCache, accessCache } = accessControlService;
const sessionActivityService = createSessionActivityService(sequelize, { sessionBucketMs: SESSION_BUCKET_MS, sessionTrackingEnabled });
const { ensureSessionActivityTable, recordSessionActivity } = sessionActivityService;
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
    maxAge: 1000 * 60 * 60 * 24 * 7, // 1 Week
  }
}));

// Ensure access control tables exist and defaults are seeded
ensureAccessControlTables();
if (sessionTrackingEnabled) ensureSessionActivityTable();

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
    logger.info(`Authenticating brand user ${email} with brand config:`, brandCfg);
    if (!brandCfg) return done(null, false, { message: 'Unknown brand' });
    const brandConn = await getBrandConnection(brandCfg);
    const user = await fetchBrandUserByEmail(brandConn, email);
    if (!user || user.is_active === false) return done(null, false, { message: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return done(null, false, { message: 'Invalid credentials' });
    return done(null, { id: user.id, email: user.email, role: user.role, brandKey: brandCfg.key, isAuthor: false });
  } catch (e) {
    return done(e);
  }
}));

// Google OAuth (optional; enabled when GOOGLE_CLIENT_ID is set)
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  const callbackURL = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback';
  const requireBrandDbUser = String(process.env.REQUIRE_BRAND_DB_USER || 'false').toLowerCase() === 'true';
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL,
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const email = Array.isArray(profile?.emails) && profile.emails[0]?.value ? profile.emails[0].value : null;
      const verified = Array.isArray(profile?.emails) && (profile.emails[0]?.verified || profile.emails[0]?.verified === true);
      if (!email) return done(null, false, { message: 'Email not available from Google profile' });
      if (!verified) {
        // Allow if Google didn't send 'verified' flag; otherwise enforce
        const enforceVerified = String(process.env.ENFORCE_GOOGLE_EMAIL_VERIFIED || 'false').toLowerCase() === 'true';
        if (enforceVerified) return done(null, false, { message: 'Google email not verified' });
      }
      // Author-by-domain: if email domain matches AUTHOR_GOOGLE_DOMAIN, elevate to author
      const normalizeDomain = (d) => (d || '').toString().trim().toLowerCase();
      const domainMatches = (host, rule) => {
        const h = normalizeDomain(host);
        const r = normalizeDomain(rule);
        if (!h || !r) return false;
        return h === r || h.endsWith(`.${r}`);
      };
      const authorDomain = normalizeDomain(process.env.AUTHOR_GOOGLE_DOMAIN);
      const domainPart = email.includes('@') ? normalizeDomain(email.split('@')[1]) : '';
      if (authorDomain && domainMatches(domainPart, authorDomain)) {
        return done(null, { id: email, email, role: 'author', brandKey: null, isAuthor: true, sso: 'google' });
      }
      const settings = await getAccessSettings();
      let wlHit = null;
      if (settings.mode === 'whitelist') {
        const [rows] = await sequelize.query('SELECT id, email, brand_key FROM access_whitelist_emails WHERE email = ? LIMIT 1', { replacements: [email] });
        wlHit = rows && rows[0] ? rows[0] : null;
        if (!wlHit) return done(null, false, { message: 'Not whitelisted', reason: 'not_whitelisted' });
      }

      // Resolve brand
      let brandCfg = null;
      if (wlHit && wlHit.brand_key) {
        const { getBrands } = require('./config/brands');
        const map = getBrands();
        const key = String(wlHit.brand_key || '').toUpperCase();
        brandCfg = map[key] || null;
      }
      if (!brandCfg) brandCfg = resolveBrandFromEmail(email);
      if (!brandCfg) return done(null, false, { message: settings.mode === 'whitelist' ? 'Brand not resolved for whitelisted email' : 'Your email domain is not authorized', reason: settings.mode === 'whitelist' ? 'brand_unknown' : 'not_authorized_domain' });

      // Enforce or auto-provision brand user as configured
      if (requireBrandDbUser || settings.autoProvision) {
        try {
          const { getBrandConnection } = require('./lib/brandConnectionManager');
          const conn = await getBrandConnection(brandCfg);
          let userRow = await fetchBrandUserByEmail(conn, email);
          if (!userRow) {
            if (settings.autoProvision) {
              const secret = crypto.randomBytes(32).toString('hex');
              const hash = await bcrypt.hash(secret, 10);
              userRow = await createBrandUser(conn, { email, password_hash: hash, role: 'user', is_active: true });
            } else {
              return done(null, false, { message: 'User not provisioned for this brand', reason: 'user_not_provisioned' });
            }
          }
          if (!userRow || userRow.is_active === false) return done(null, false, { message: 'User inactive', reason: 'user_inactive' });
        } catch (e) {
          return done(null, false, { message: 'Brand user validation failed', reason: 'validation_failed' });
        }
      }
      return done(null, { id: email, email, role: 'user', brandKey: brandCfg.key, isAuthor: false, sso: 'google' });
    } catch (e) {
      return done(e);
    }
  }));
}

// --- User Cache for Performance ---
const USER_CACHE = new Map();
const CACHE_TTL = 60 * 1000; // 60 seconds

passport.serializeUser((user, done) => done(null, { id: user.id, email: user.email, brandKey: user.brandKey, isAuthor: !!user.isAuthor, sso: user.sso }));
passport.deserializeUser(async (obj, done) => {
  try {
    // 1. Check L1 Memory Cache
    const cacheKey = `user:${obj.id || 'x'}:${obj.email}`;
    if (USER_CACHE.has(cacheKey)) {
      const entry = USER_CACHE.get(cacheKey);
      if (Date.now() - entry.ts < CACHE_TTL) {
        return done(null, entry.user);
      }
      USER_CACHE.delete(cacheKey);
    }

    const cacheResult = (user) => {
      if (user) {
        USER_CACHE.set(cacheKey, { ts: Date.now(), user });
      }
      return done(null, user);
    };

    if (obj.isAuthor) {
      // Support two author modes:
      // 1) Local author (username/password) using AUTHOR_EMAIL and master users table
      // 2) Google SSO author by domain (AUTHOR_GOOGLE_DOMAIN)
      const normalizeDomain = (d) => (d || '').toString().trim().toLowerCase();
      const domainMatches = (host, rule) => {
        const h = normalizeDomain(host);
        const r = normalizeDomain(rule);
        if (!h || !r) return false;
        return h === r || h.endsWith(`.${r}`);
      };

      const email = (obj.email || '').toString();
      const domainPart = email.includes('@') ? normalizeDomain(email.split('@')[1]) : '';

      const authorDomain = normalizeDomain(process.env.AUTHOR_GOOGLE_DOMAIN);
      const domainOk = authorDomain && domainMatches(domainPart, authorDomain);

      if (domainOk) {
        // Trust the session and return a minimal author identity; no DB lookup needed
        return cacheResult({ id: obj.id, email, role: 'author', brandKey: null, isAuthor: true });
      }

      // Fallback to legacy local author via master DB user
      const authorEmail = (process.env.AUTHOR_EMAIL || '').toLowerCase();
      if (authorEmail !== email.toLowerCase()) return done(null, false);
      const authorUser = await User.findByPk(obj.id, { attributes: ['id','email','role','is_active'] });
      if (!authorUser || !authorUser.is_active || authorUser.role !== 'author') return done(null, false);
      return cacheResult({ id: authorUser.id, email: authorUser.email, role: 'author', brandKey: null, isAuthor: true });
    }
    let brandCfg = null;
    const storedKey = (obj.brandKey || '').toString().trim().toUpperCase();
    if (storedKey) {
      const map = getBrands();
      brandCfg = map[storedKey] || null;
    }
    if (!brandCfg) brandCfg = resolveBrandFromEmail(obj.email);
    if (!brandCfg) return done(null, false);

    // If this is a Google SSO brand user and we don't require a brand DB user row,
    // trust the session and avoid DB lookup (supports just-in-time access by domain).
    const requireBrandDbUser = String(process.env.REQUIRE_BRAND_DB_USER || 'false').toLowerCase() === 'true';
    if (obj.sso === 'google' && !requireBrandDbUser) {
      return cacheResult({ id: obj.id, email: obj.email, role: obj.role || 'user', brandKey: brandCfg.key, isAuthor: false });
    }

    // Otherwise, look up the brand user in the brand DB. Prefer email lookup for SSO users
    // (since SSO sessions may not have a numeric PK), and PK lookup for local-auth users.
    const brandConn = await getBrandConnection(brandCfg);
    let user = null;
    if (obj.sso === 'google') {
      user = await fetchBrandUserByEmail(brandConn, obj.email);
    } else {
      user = await fetchBrandUserById(brandConn, obj.id);
    }
    if (!user || !user.is_active) return done(null, false);
    return cacheResult({ id: user.id, email: user.email, role: user.role || 'user', brandKey: brandCfg.key, isAuthor: false });
  } catch (e) { done(e); }
});

app.use(passport.initialize());
app.use(passport.session());

if (sessionTrackingEnabled) {
  app.use((req, res, next) => {
    try {
      if (!req.isAuthenticated || !req.isAuthenticated()) return next();
      const user = req.user || {};
      if (user.isAuthor || !user.brandKey) return next();
      if (req.path === '/activity/heartbeat') return next();
      const meta = {
        path: (req.originalUrl || '').slice(0, 180),
        method: req.method,
      };
      setImmediate(() => {
        recordSessionActivity({
          brandKey: user.brandKey,
          email: user.email,
          userAgent: req.get('user-agent'),
          ip: req.ip,
          meta,
        });
      });
    } catch (err) {
      // Swallow session tracking errors so requests continue unaffected
      console.warn('Session tracking middleware skipped', err?.message || err);
    }
    return next();
  });
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ message: 'datum backend is running' });
});

// Routers
app.use('/auth', buildAuthRouter({ passport, accessCache }));
app.use('/activity', buildActivityRouter({ sessionTrackingEnabled, recordSessionActivity }));
app.use('/author/access-control', buildAccessControlRouter({ sequelize, getAccessSettings, bustAccessCache }));
app.use('/author', buildAuthorBrandsRouter(sequelize));
app.use('/author', buildAuthorRouter());
app.use('/author/adjustment-buckets', buildAdjustmentBucketsRouter({ SessionAdjustmentBucket, SessionAdjustmentAudit }));
app.use('/author/alerts', buildAlertsRouter({ Alert, AlertChannel, BrandAlertChannel }));
app.use('/author', buildAdjustmentsRouter({ SessionAdjustmentBucket, SessionAdjustmentAudit }));
app.use('/metrics', buildMetricsRouter(sequelize));
app.use('/external', buildExternalRouter());
app.use('/', buildUploadsRouter());
app.use('/', buildApiKeysRouter(sequelize));
app.use('/shopify', buildShopifyRouter(sequelize));
app.use('/webhooks', buildWebhooksRouter({ Alert, AlertChannel, BrandAlertChannel }));
app.use('/notifications', buildNotificationsRouter()); // [NEW]

// ---- Init -------------------------------------------------------------------
async function init() {
  await sequelize.authenticate();
  if (sessionStore && typeof sessionStore.sync === 'function') {
    await sessionStore.sync();
  }
  await User.sync(); // optionally use migrations in real app
  // Ensure author tables exist if not created via manual DDL
  try { await SessionAdjustmentBucket.sync(); } catch (e) { console.warn('Bucket sync skipped', e?.message); }
  try { await SessionAdjustmentAudit.sync(); } catch (e) { console.warn('Audit sync skipped', e?.message); }
  try { await sequelize.models.api_keys.sync(); } catch (e) { console.warn('API keys sync skipped', e?.message); }
  try { await Alert.sync(); } catch (e) { console.warn('Alert sync skipped', e?.message); }
  try { await AlertChannel.sync(); } catch (e) { console.warn('AlertChannel sync skipped', e?.message); }
  // seed admin if none
  if (!(await User.findOne({ where: { email: process.env.ADMIN_EMAIL || 'admin@example.com' } }))) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'ChangeMe123!', 12);
    await User.create({ email: process.env.ADMIN_EMAIL || 'admin@example.com', password_hash: hash, role: 'admin' });
    logger.info('Seeded admin user');
  }
  // seed author if configured
  if (process.env.AUTHOR_EMAIL && process.env.AUTHOR_PASSWORD) {
    const existingAuthor = await User.findOne({ where: { email: process.env.AUTHOR_EMAIL } });
    if (!existingAuthor) {
      const hash = await bcrypt.hash(process.env.AUTHOR_PASSWORD, 12);
      await User.create({ email: process.env.AUTHOR_EMAIL, password_hash: hash, role: 'author', is_active: true });
      logger.info('Seeded author user');
    }
  }
  const port = process.env.PORT || 3000;
  const server = app.listen(port, () => logger.info(`Metrics API running on :${port}`));
  return server;
}

module.exports = {
  app,
  init,
  sequelize,
  sessionStore,
  User,
  SessionAdjustmentBucket,
  SessionAdjustmentAudit,
  Alert,
  AlertChannel,
  BrandAlertChannel,
};
