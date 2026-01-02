const express = require('express');
const cookieParser = require('cookie-parser');
const authRoutes = require('./routes/auth.routes');

const app = express();

app.use(express.json());
app.use(cookieParser());

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
