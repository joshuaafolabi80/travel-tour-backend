// travel-tour-backend/routes/appReviewRoutes.js

const express = require('express');
const router = express.Router();
const appReviewController = require('../controllers/appReviewController');
const { auth, adminAuth } = require('../middleware/auth');

// Public routes
router.get('/reviews', appReviewController.getReviews);

// User routes (require authentication)
router.post('/reviews/submit', auth, appReviewController.submitReview);
router.get('/reviews/my', auth, appReviewController.getUserReview);
router.post('/share/track', auth, appReviewController.trackShare);

// Admin routes
router.get('/admin/analytics/shares', adminAuth, appReviewController.getShareAnalytics);
router.get('/admin/statistics', adminAuth, appReviewController.getStatistics);

module.exports = router;