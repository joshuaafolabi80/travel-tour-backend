// travel-tour-backend/routes/appReviewRoutes.js

const express = require('express');
const router = express.Router();
const appReviewController = require('../controllers/appReviewController');
const { auth, adminAuth } = require('../middleware/auth');

// ✅ PUBLIC ROUTES (NO AUTH REQUIRED - EVERYONE CAN SEE)
router.get('/reviews/public', appReviewController.getPublicReviews);
router.get('/reviews/stats', appReviewController.getPublicReviews); // For stats only

// ✅ USER ROUTES (REQUIRE AUTHENTICATION)
router.post('/reviews/submit', auth, appReviewController.submitReview);
router.get('/reviews/my', auth, appReviewController.getUserReview);
router.post('/share/track', auth, appReviewController.trackShare);
router.post('/reviews/:reviewId/helpful', auth, appReviewController.markHelpful);

// ✅ ADMIN ROUTES
router.get('/admin/reviews/pending', adminAuth, appReviewController.getReviews); // Get pending for approval
router.put('/admin/reviews/:id/status', adminAuth, appReviewController.updateReviewStatus);
router.get('/admin/analytics/shares', adminAuth, appReviewController.getShareAnalytics);
router.get('/admin/statistics', adminAuth, appReviewController.getStatistics);

// REMOVE THIS - it should be in the controller file, not here
// exports.updateReviewStatus = async (req, res) => { ... }

module.exports = router;