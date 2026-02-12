const express = require('express');
const http = require('http');
const passport = require('passport');
const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');

const { initSequelize, defineModels } = require('./config/database');
const logger = require('./utils/logger');

// Route builders
const { buildActivityRouter } = require('./routes/activity');
const { buildApiKeysRouter } = require('./routes/apiKeys');
const { buildAuthRouter } = require('./routes/auth');
const { buildAuthorRouter } = require('./routes/author');
const { buildAuthorBrandsRouter } = require('./routes/authorBrands');
const { buildExternalRouter } = require('./routes/external');
const { buildMetricsRouter } = require('./routes/metrics');
const { buildNotificationsRouter } = require('./routes/notifications');
const { buildShopifyRouter } = require('./routes/shopify');
const { buildUploadsRouter } = require('./routes/uploads');

// Services
const { createAccessControlService } = require('./services/accessControlService');
const { createSessionActivityService } = require('./services/sessionActivityService');

const app = express();
app.set('trust proxy', 1);
let sequelizeInstance = null;

/**
 * Initializes the analytics service
 * - Connects to primary database
 * - Sets up authentication strategies
 * - Configures session management
 * - Mounts all API routes
 */
async function init() {
    sequelizeInstance = initSequelize();
    const { User } = defineModels(sequelizeInstance);

    // Initialize companion services
    const accessControlService = createAccessControlService(sequelizeInstance);
    await accessControlService.ensureAccessControlTables();

    const sessionActivityService = createSessionActivityService(sequelizeInstance, {
        sessionTrackingEnabled: true
    });
    await sessionActivityService.ensureSessionActivityTable();

    // Passport Local Strategy setup
    passport.use(new LocalStrategy({
        usernameField: 'email',
        passwordField: 'password'
    }, async (email, password, done) => {
        try {
            const user = await User.findOne({ where: { email, is_active: true } });
            if (!user) return done(null, false, { message: 'Invalid credentials' });
            const match = await bcrypt.compare(password, user.password_hash);
            if (!match) return done(null, false, { message: 'Invalid credentials' });
            return done(null, user.toJSON());
        } catch (err) {
            return done(err);
        }
    }));

    // Passport Google OAuth setup
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
        passport.use(new GoogleStrategy({
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback'
        }, async (accessToken, refreshToken, profile, done) => {
            try {
                const email = profile.emails?.[0]?.value;
                if (!email) return done(new Error('No email found in Google profile'));
                let user = await User.findOne({ where: { email } });
                if (!user) return done(null, false, { reason: 'not_found', message: 'User not registered' });
                if (!user.is_active) return done(null, false, { reason: 'inactive', message: 'User account is inactive' });
                return done(null, user.toJSON());
            } catch (err) {
                return done(err);
            }
        }));
    }

    passport.serializeUser((user, done) => done(null, user.id));
    passport.deserializeUser(async (id, done) => {
        try {
            const user = await User.findByPk(id);
            done(null, user ? user.toJSON() : null);
        } catch (err) {
            done(err);
        }
    });

    // Basic middleware
    app.use(express.json({ limit: '5mb' }));
    app.use(cookieParser());

    // CORS configuration
    const CORS_ORIGINS = (process.env.CORS_ORIGINS || '')
        .split(',')
        .map(o => o.trim())
        .filter(Boolean);

    if (CORS_ORIGINS.length > 0) {
        app.use((req, res, next) => {
            const origin = req.headers.origin;
            // Normalize origins by removing trailing slashes for comparison
            const normalizedOrigins = CORS_ORIGINS.map(o => o.replace(/\/$/, ''));
            const normalizedOrigin = origin ? origin.replace(/\/$/, '') : '';

            if (normalizedOrigin && normalizedOrigins.includes(normalizedOrigin)) {
                res.setHeader('Access-Control-Allow-Origin', origin);
                res.setHeader('Vary', 'Origin');
                res.setHeader('Access-Control-Allow-Credentials', 'true');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
                res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
            }
            if (req.method === 'OPTIONS') return res.sendStatus(204);
            return next();
        });
    }

    // Session persistence
    const sessionStore = new SequelizeStore({
        db: sequelizeInstance,
        tableName: 'sessions',
        checkExpirationInterval: 15 * 60 * 1000,
        expiration: 7 * 24 * 60 * 60 * 1000
    });

    app.use(session({
        secret: process.env.SESSION_SECRET || 'dev-secret-key',
        store: sessionStore,
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 7 * 24 * 60 * 60 * 1000,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
        }
    }));

    // Use session.sync() or sequelize.sync() if necessary; usually handled via startup scripts
    // sessionStore.sync(); 

    app.use(passport.initialize());
    app.use(passport.session());

    // Mount API modules
    app.use('/auth', buildAuthRouter({ passport, accessCache: accessControlService.accessCache }));
    app.use('/activity', buildActivityRouter({
        sessionTrackingEnabled: true,
        recordSessionActivity: sessionActivityService.recordSessionActivity
    }));
    app.use('/author', buildAuthorRouter());
    app.use('/author-brands', buildAuthorBrandsRouter());
    app.use('/api-keys', buildApiKeysRouter(sequelizeInstance));
    app.use('/metrics', buildMetricsRouter(sequelizeInstance));
    app.use('/notifications', buildNotificationsRouter());
    app.use('/shopify', buildShopifyRouter(sequelizeInstance));
    app.use('/uploads', buildUploadsRouter());
    app.use('/external', buildExternalRouter());

    // Health check endpoint
    app.get('/health', (req, res) => res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() }));

    // Global error handler
    app.use((err, req, res, _next) => {
        logger.error('Unhandled analytics-service error:', {
            message: err.message,
            stack: err.stack,
            path: req.path,
            method: req.method
        });
        res.status(500).json({ error: 'Internal Server Error' });
    });

    const server = http.createServer(app);
    const port = Number(process.env.PORT || 3006);

    return new Promise((resolve) => {
        server.listen(port, '0.0.0.0', () => {
            logger.info(`[analytics-service] listening on 0.0.0.0:${port}`);
            resolve(server);
        });
    });
}

module.exports = {
    init,
    get sequelize() { return sequelizeInstance; }
};
