// backend/controllers/appReviewController.js
const AppReview = require('../models/AppReview');
const ShareAnalytics = require('../models/ShareAnalytics');

// SUBMIT REVIEW
exports.submitReview = async (req, res) => {
    try {
        console.log('📝 Review submission request received');
        
        // Simple validation
        if (!req.body.rating) {
            return res.status(400).json({
                success: false,
                message: 'Rating is required'
            });
        }
        
        // For now, just log and return success
        console.log('Review data:', {
            rating: req.body.rating,
            review: req.body.review,
            appStore: req.body.appStore || 'web',
            user: req.user ? req.user.id : 'unknown'
        });
        
        res.status(200).json({
            success: true,
            message: 'Review submitted successfully (test mode)',
            data: {
                rating: req.body.rating,
                review: req.body.review,
                submittedAt: new Date()
            }
        });
        
    } catch (error) {
        console.error('❌ Error in submitReview:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// GET REVIEWS
exports.getReviews = async (req, res) => {
    try {
        res.status(200).json({
            success: true,
            reviews: [],
            message: 'No reviews yet'
        });
    } catch (error) {
        console.error('Error in getReviews:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// GET USER REVIEW
exports.getUserReview = async (req, res) => {
    try {
        res.status(200).json({
            success: true,
            review: null,
            message: 'No review found for user'
        });
    } catch (error) {
        console.error('Error in getUserReview:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// TRACK SHARE
exports.trackShare = async (req, res) => {
    try {
        console.log('📱 Share tracked:', req.body.platform);
        res.status(200).json({
            success: true,
            message: 'Share tracked'
        });
    } catch (error) {
        console.error('Error in trackShare:', error);
        res.status(200).json({
            success: true,
            message: 'Share tracked (error ignored)'
        });
    }
};

// GET ANALYTICS
exports.getShareAnalytics = async (req, res) => {
    try {
        res.status(200).json({
            success: true,
            analytics: [],
            message: 'No analytics data yet'
        });
    } catch (error) {
        console.error('Error in getShareAnalytics:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// GET STATISTICS
exports.getStatistics = async (req, res) => {
    try {
        res.status(200).json({
            success: true,
            statistics: {
                totalReviews: 0,
                averageRating: 0,
                totalShares: 0,
                pendingReviews: 0
            }
        });
    } catch (error) {
        console.error('Error in getStatistics:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};