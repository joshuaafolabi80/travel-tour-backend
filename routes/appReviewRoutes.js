const express = require('express');
const router = express.Router();
const { auth, adminAuth } = require('../middleware/auth');

// We destructure here so that if any function is missing in the controller, 
// the app will crash with a clear "Missing Function" error immediately.
const {
    getPublicReviews,
    submitReview,
    getUserReview,
    trackShare,
    markHelpful,
    getReviews,
    updateReviewStatus,
    getShareAnalytics,
    getStatistics
} = require('../controllers/appReviewController');

// ✅ PUBLIC
router.get('/reviews/public', getPublicReviews);
router.get('/reviews/stats', getPublicReviews); 

// ✅ USER
router.post('/reviews/submit', auth, submitReview);
router.get('/reviews/my', auth, getUserReview);
router.post('/share/track', auth, trackShare);
router.post('/reviews/:reviewId/helpful', auth, markHelpful);

// ✅ ADMIN
router.get('/admin/reviews/pending', adminAuth, getReviews);
router.put('/admin/reviews/:id/status', adminAuth, updateReviewStatus);
router.get('/admin/analytics/shares', adminAuth, getShareAnalytics);
router.get('/admin/statistics', adminAuth, getStatistics);

module.exports = router;