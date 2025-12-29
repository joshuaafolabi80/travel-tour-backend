const express = require('express');
const router = express.Router();
const { auth, adminAuth } = require('../middleware/auth');

// ✅ IMPORT WITHOUT DESTRUCTURING - THIS IS KEY!
const appReviewController = require('../controllers/appReviewController');

// Debug: Check if controller loads
console.log('✅ Routes: Controller loaded:', typeof appReviewController);
console.log('✅ Routes: updateReviewStatus exists:', typeof appReviewController.updateReviewStatus);

// ✅ PUBLIC ROUTES
router.get('/reviews/public', appReviewController.getPublicReviews);
router.get('/reviews/stats', appReviewController.getPublicReviews);

// ✅ USER ROUTES
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