// travel-tour-backend/meet-module/config/database.js
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Meet Module connected to MongoDB');
  } catch (error) {
    console.error('❌ Meet Module DB connection error:', error);
    process.exit(1);
  }
};

module.exports = connectDB;