require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');

const PORT = process.env.PORT || 4010;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/datum_sessions';

// Database connection
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(MONGO_URI);

    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

// Start the server
const startServer = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`Sessions-service running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  });
};

startServer();
