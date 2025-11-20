// travel-tour-backend/meet-module/server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://travel-tour-academy.onrender.com',
    'https://travel-tour-academy-frontend.onrender.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Database Connection
const connectDB = async () => {
  try {
    // Use the same MongoDB connection as your main app
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/travel_tour_meet';
    
    console.log('🔗 Connecting to MongoDB...');
    console.log('📊 Database:', mongoURI);
    
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ MongoDB Connected Successfully');
    console.log('📁 Database Name:', mongoose.connection.name);
    
    // Check connection status
    mongoose.connection.on('connected', () => {
      console.log('🎯 Mongoose connected to MongoDB');
    });
    
    mongoose.connection.on('error', (err) => {
      console.error('❌ Mongoose connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ Mongoose disconnected from MongoDB');
    });
    
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

// 🆕 CREATE UPLOADS DIRECTORY IF IT DOESN'T EXIST
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Created uploads directory:', uploadsDir);
}

// 🆕 IMPORT THE NEW MEET ROUTES
console.log('🔄 Loading Enhanced Meet Routes...');
const meetRoutes = require('./routes/meet-routes');
app.use('/api/meet', meetRoutes);

console.log('✅ Enhanced Meet Routes mounted at /api/meet');

// 🆕 ALSO KEEP THE EXISTING API GATEWAY FOR BACKWARD COMPATIBILITY
console.log('🔄 Loading Legacy Meet Module API Gateway...');
const { router: meetApiGateway } = require('./apiGateway');
app.use('/api/meet-legacy', meetApiGateway);

console.log('✅ Legacy Meet Module API Gateway mounted at /api/meet-legacy');

// Enhanced Health check with detailed info
app.get('/health', async (req, res) => {
  try {
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    const activeConnections = mongoose.connection.readyState;
    
    // Check if uploads directory exists and get file count
    let uploadsInfo = { exists: false, fileCount: 0 };
    if (fs.existsSync(uploadsDir)) {
      uploadsInfo.exists = true;
      const files = fs.readdirSync(uploadsDir);
      uploadsInfo.fileCount = files.length;
    }
    
    res.json({ 
      success: true,
      status: 'Meet Module is running', 
      module: 'Travel Tour Academy - Meet Module',
      timestamp: new Date().toISOString(),
      serverTime: new Date().toLocaleString(),
      database: {
        status: dbStatus,
        connectionState: activeConnections,
        name: mongoose.connection.name || 'Not connected'
      },
      uploads: uploadsInfo,
      endpoints: {
        enhanced: '/api/meet/* (Seamless Join)',
        legacy: '/api/meet-legacy/* (Backward Compatible)',
        health: '/health',
        meetings: '/api/meet/create, /api/meet/active, etc.',
        resources: '/api/meet/resources/share, /api/meet/resources/meeting/:id',
        files: '/api/meet/uploads/:filename'
      },
      features: {
        seamlessJoin: true,
        googleCalendarIntegration: true,
        instantMeetingCreation: true
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'Error',
      error: error.message
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🚀 Travel Tour Academy - Meet Module API',
    version: '2.0.0',
    description: 'Enhanced real-time meeting and resource sharing module with seamless Google Meet integration',
    features: [
      'Seamless Google Meet joining',
      'Instant meeting creation',
      'Resource sharing with permanent storage',
      'Google Calendar API integration',
      'Real-time participant tracking'
    ],
    endpoints: {
      health: '/health',
      enhancedApi: '/api/meet (Seamless Join)',
      legacyApi: '/api/meet-legacy (Backward Compatible)',
      documentation: 'See /health for detailed endpoint information'
    },
    timestamp: new Date().toISOString()
  });
});

// Global error handling middleware
app.use((error, req, res, next) => {
  console.error('🚨 Global Error Handler:', error);
  
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      details: error.message
    });
  }
  
  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: 'Invalid ID format',
      details: error.message
    });
  }
  
  // Default error
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method,
    availableEndpoints: {
      root: 'GET /',
      health: 'GET /health',
      enhancedApi: 'GET /api/meet/* (Seamless Join)',
      legacyApi: 'GET /api/meet-legacy/* (Backward Compatible)'
    }
  });
});

// Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT. Shutting down gracefully...');
  await mongoose.connection.close();
  console.log('✅ MongoDB connection closed.');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM. Shutting down gracefully...');
  await mongoose.connection.close();
  console.log('✅ MongoDB connection closed.');
  process.exit(0);
});

// Start server
const PORT = process.env.MEET_MODULE_PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

connectDB().then(() => {
  app.listen(PORT, HOST, () => {
    console.log('='.repeat(60));
    console.log('🚀 TRAVEL TOUR ACADEMY - ENHANCED MEET MODULE');
    console.log('='.repeat(60));
    console.log(`📍 Server running on: http://${HOST}:${PORT}`);
    console.log(`🔗 Health Check: http://${HOST}:${PORT}/health`);
    console.log(`🎯 Enhanced API: http://${HOST}:${PORT}/api/meet`);
    console.log(`🔁 Legacy API: http://${HOST}:${PORT}/api/meet-legacy`);
    console.log(`📁 Uploads Directory: ${uploadsDir}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`⏰ Server Time: ${new Date().toLocaleString()}`);
    console.log('='.repeat(60));
    console.log('✅ Enhanced Meet Module is ready to handle requests!');
    console.log('✅ Seamless Google Meet integration enabled!');
    console.log('='.repeat(60));
  });
}).catch(err => {
  console.error('❌ Failed to start Enhanced Meet Module:', err);
  process.exit(1);
});