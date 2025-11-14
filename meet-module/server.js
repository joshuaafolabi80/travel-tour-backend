// travel-tour-backend/meet-module/server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database Connection (USING YOUR EXISTING MONGODB)
const connectDB = require('./config/database');

// Routes
app.use('/api/meetings', require('./routes/meetings'));
app.use('/api/resources', require('./routes/resources'));
app.use('/api/uploads', require('./routes/uploads'));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    module: 'Google Meet Integration',
    timestamp: new Date().toISOString()
  });
});

// Start on DIFFERENT PORT (3001 vs your main app's port)
const PORT = process.env.MEET_MODULE_PORT || 3001;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🎯 Meet Module running on port ${PORT}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  });
});