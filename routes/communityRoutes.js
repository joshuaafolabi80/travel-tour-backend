// server/routes/communityRoutes.js
const express = require('express');
const router = express.Router();
const communityController = require('../controllers/communityController');
const { authMiddleware } = require('../routes/auth');

// Apply auth middleware to all routes
router.use(authMiddleware);

// Get community message history
router.get('/messages', communityController.getMessageHistory);

// Save a community message
router.post('/messages', communityController.saveMessage);

// Check for active calls
router.get('/active-call', communityController.getActiveCall);

// Clear all messages (admin only)
router.delete('/messages', communityController.clearMessages);

module.exports = router;