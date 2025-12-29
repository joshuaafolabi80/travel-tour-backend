// Add these new routes
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

// ✅ Add updateReviewStatus function to your controller
exports.updateReviewStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, adminResponse } = req.body;
        
        const updateData = { status };
        
        if (adminResponse) {
            updateData.adminResponse = {
                text: adminResponse,
                respondedBy: req.user.name || req.user.email,
                respondedAt: new Date()
            };
        }
        
        const review = await AppReview.findByIdAndUpdate(
            id,
            updateData,
            { new: true }
        );
        
        res.status(200).json({
            success: true,
            message: `Review ${status}`,
            review
        });
    } catch (error) {
        console.error('Error updating review status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating review'
        });
    }
};