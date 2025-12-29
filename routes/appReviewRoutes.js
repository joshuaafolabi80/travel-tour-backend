// backend/routes/appReviewRoutes.js
const express = require('express');
const router = express.Router();

// ✅ IMPORTANT: Import the controller FIRST to test
const appReviewController = require('../controllers/appReviewController');

// Debug: Check if controller functions exist
console.log('🔍 Checking controller functions:');
console.log('submitReview exists:', typeof appReviewController.submitReview);
console.log('getReviews exists:', typeof appReviewController.getReviews);

// Try importing middleware - if it fails, create a simple version
let authMiddleware;
let adminAuthMiddleware;

try {
    const auth = require('../middleware/auth');
    authMiddleware = auth.authMiddleware || auth.auth;
    adminAuthMiddleware = auth.adminAuth;
    console.log('✅ Auth middleware loaded');
} catch (error) {
    console.log('⚠️ Using simple auth middleware');
    // Create simple middleware if file doesn't exist
    authMiddleware = (req, res, next) => {
        console.log('🔒 Simple auth middleware called');
        req.user = { id: 'test-user-id', role: 'user' };
        next();
    };
    
    adminAuthMiddleware = (req, res, next) => {
        console.log('🔒 Simple admin auth middleware called');
        req.user = { id: 'test-admin-id', role: 'admin' };
        next();
    };
}

// ✅ PUBLIC ROUTES
router.get('/reviews', appReviewController.getReviews);

// ✅ USER ROUTES
router.post('/reviews/submit', authMiddleware, appReviewController.submitReview);
router.get('/reviews/my', authMiddleware, appReviewController.getUserReview);
router.post('/share/track', authMiddleware, appReviewController.trackShare);

// ✅ ADMIN ROUTES
router.get('/admin/analytics/shares', adminAuthMiddleware, appReviewController.getShareAnalytics);
router.get('/admin/statistics', adminAuthMiddleware, appReviewController.getStatistics);

// ✅ TEST ROUTE (NO AUTH NEEDED)
router.get('/test', (req, res) => {
    res.json({ 
        success: true, 
        message: 'App review routes are working!',
        timestamp: new Date().toISOString()
    });
});

console.log('✅ App review routes configured successfully');

module.exports = router;