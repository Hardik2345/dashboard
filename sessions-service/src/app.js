const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const sessionRoutes = require('./routes/sessionRoutes');
const { collectRoutes, createHealthMonitorReporter } = require('./healthMonitor');
const {
  initObservability,
  sentryErrorMiddleware,
} = require('./observability');

const app = express();

// Standard middlewares
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(morgan('dev'));
initObservability(app);
app.use(createHealthMonitorReporter({
  serviceName: 'sessions-service',
  baseUrl: 'http://sessions-service:4010',
}));

// Rate limiting for the sessions endpoint
const sessionsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: 'Too many session requests from this IP, please try again later'
});

// Routes
app.use('/sessions', sessionsLimiter, sessionRoutes);

// General health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP' });
});

app.get('/health/monitor', (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'sessions-service',
    message: 'probe_ok',
  });
});

// Error handler
app.use(sentryErrorMiddleware);
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

module.exports = app;
module.exports.buildHealthMonitorRegistrationPayload = function buildHealthMonitorRegistrationPayload() {
  return {
    serviceName: 'sessions-service',
    baseUrl: 'http://sessions-service:4010',
    healthEndpoint: '/health',
    dependencies: ['mongo'],
    endpoints: [
      { path: '/health', method: 'GET', critical: true, intervalSeconds: 30, successStatusFamily: '2xx' },
      { path: '/health/monitor', method: 'GET', critical: true, intervalSeconds: 60, successStatusFamily: '2xx' },
    ],
    discoveredRoutes: [
      ...collectRoutes(app, { sourceModule: 'src/app.js' }),
      ...collectRoutes(sessionRoutes, { mountPath: '/sessions', sourceModule: 'src/routes/sessionRoutes.js' }),
    ],
  };
};
