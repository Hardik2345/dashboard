require('express-async-errors');
const express = require('express');
const tenantRoutes = require('./routes/tenant.routes');
const { TenantError } = require('./utils/errors');

const app = express();

app.use(express.json());

// Routes
app.use('/tenant', tenantRoutes);

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'tenant-router' });
});

// Centralized Error Handler
app.use((err, req, res, _next) => {
    if (err instanceof TenantError) {
        return res.status(err.statusCode).json({ error: err.code });
    }

    console.error('[AppError]', err);
    res.status(500).json({ error: 'internal_server_error' });
});

module.exports = app;
