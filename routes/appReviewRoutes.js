const express = require('express');
const router = express.Router();

// Import middleware and controller
const { auth, adminAuth } = require('../middleware/auth');
const appReviewController = require('../controllers/appReviewController');

// ✅ PUBLIC ROUTES
router.get('/reviews/public', appReviewController.getPublicReviews);
router.get('/reviews/stats', appReviewController.getPublicReviews);

// ✅ USER ROUTES (The 'auth' here was the cause of the crash)
router.post('/reviews/submit', auth, appReviewController.submitReview);
router.get('/reviews/my', auth, appReviewController.getUserReview);
router.post('/share/track', auth, appReviewController.trackShare);
router.post('/reviews/:reviewId/helpful', auth, appReviewController.markHelpful);

// ✅ ADMIN ROUTES
router.get('/admin/reviews/pending', adminAuth, appReviewController.getReviews);
router.put('/admin/reviews/:id/status', adminAuth, appReviewController.updateReviewStatus);
router.get('/admin/analytics/shares', adminAuth, appReviewController.getShareAnalytics);
router.get('/admin/statistics', adminAuth, appReviewController.getStatistics);

module.exports = router;