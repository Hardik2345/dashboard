const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const app = require('./app');
const connectDB = require('./utils/db');

// Connect to Database
connectDB();

const PORT = process.env.PORT || 3004;

app.listen(PORT, () => {
    console.log(`[TenantRouter] Service started on port ${PORT}`);
});
