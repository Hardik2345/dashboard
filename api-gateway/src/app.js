const express = require('express');
const cookieParser = require('cookie-parser');
const authRoutes = require('./routes/auth.routes');

const app = express();

app.set('trust proxy', 1);

app.use(express.json());
app.use(cookieParser());

// Basic CORS with credentials support (configure via env)
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

console.log('[api-gateway] CORS_ORIGINS configured:', CORS_ORIGINS);
console.log('[api-gateway] COOKIE_SAMESITE configured:', process.env.COOKIE_SAMESITE);

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

        if (req.method === 'OPTIONS') {
            return res.sendStatus(204);
        }
        return next();
    });
}

app.use('/auth', authRoutes);

// Health check
app.get('/health', (req, res) => res.status(200).send('OK'));

// Standard error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

module.exports = app;
