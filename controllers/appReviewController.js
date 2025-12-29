// backend/controllers/appReviewController.js - COMPLETE FIXED VERSION
const AppReview = require('../models/AppReview');
const ShareAnalytics = require('../models/ShareAnalytics');
const User = require('../models/User');

// SUBMIT A NEW REVIEW
const submitReview = async (req, res) => {
    try {
        console.log('📝 Review submission request received');
        const { rating, review, appStore } = req.body;
        const userId = req.user.id;

        // Validate rating
        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({
                success: false,
                message: 'Rating must be between 1 and 5 stars'
            });
        }

        // Check if user already reviewed for this app store
        const existingReview = await AppReview.findOne({
            userId,
            appStore: appStore || 'web'
        });

        if (existingReview) {
            // Update existing review
            existingReview.rating = rating;
            existingReview.review = review || existingReview.review;
            existingReview.status = 'pending';
            await existingReview.save();

            return res.status(200).json({
                success: true,
                message: 'Review updated successfully',
                review: existingReview,
                isUpdate: true
            });
        }

        // Get user info
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Create new review
        const newReview = new AppReview({
            userId,
            userName: user.name || user.email.split('@')[0],
            userEmail: user.email,
            rating,
            review: review || '',
            appStore: appStore || 'web',
            deviceInfo: {
                deviceType: req.headers['user-agent']?.includes('Mobile') ? 'mobile' : 'desktop',
                os: req.headers['user-agent'] || 'unknown',
                browser: req.headers['user-agent'] || 'unknown'
            }
        });

        await newReview.save();

        console.log(`✅ Review submitted by ${user.name || user.email}: ${rating} stars`);

        res.status(201).json({
            success: true,
            message: 'Review submitted successfully',
            review: newReview,
            isUpdate: false
        });

    } catch (error) {
        console.error('❌ Error submitting review:', error);
        res.status(500).json({
            success: false,
            message: 'Error submitting review',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

// GET ALL REVIEWS
const getReviews = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            status = 'approved',
            rating,
            appStore,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        // Build filter
        const filter = { status };
        
        if (rating) filter.rating = parseInt(rating);
        if (appStore) filter.appStore = appStore;

        const skip = (page - 1) * limit;
        const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

        const reviews = await AppReview.find(filter)
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit))
            .populate('userId', 'name email')
            .lean();

        const total = await AppReview.countDocuments(filter);
        const approvedReviews = await AppReview.find({ status: 'approved' });
        
        const averageRating = approvedReviews.length > 0
            ? approvedReviews.reduce((sum, review) => sum + review.rating, 0) / approvedReviews.length
            : 0;

        const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        approvedReviews.forEach(review => {
            ratingDistribution[review.rating]++;
        });

        res.status(200).json({
            success: true,
            reviews,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            },
            stats: {
                averageRating: averageRating.toFixed(1),
                totalReviews: approvedReviews.length,
                ratingDistribution
            }
        });

    } catch (error) {
        console.error('Error fetching reviews:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching reviews',
            error: error.message
        });
    }
};

// GET USER'S REVIEW
const getUserReview = async (req, res) => {
    try {
        const userId = req.user.id;
        const { appStore = 'web' } = req.query;

        const review = await AppReview.findOne({
            userId,
            appStore
        });

        if (!review) {
            return res.status(404).json({
                success: false,
                message: 'No review found'
            });
        }

        res.status(200).json({
            success: true,
            review
        });

    } catch (error) {
        console.error('Error fetching user review:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching review',
            error: error.message
        });
    }
};

// TRACK SHARE ANALYTICS
const trackShare = async (req, res) => {
    try {
        const { platform, shareMethod = 'just-once' } = req.body;
        const userId = req.user?.id;

        const shareRecord = new ShareAnalytics({
            userId: userId || null,
            platform,
            shareMethod,
            deviceInfo: {
                deviceType: req.headers['user-agent']?.includes('Mobile') ? 'mobile' : 'desktop',
                os: req.headers['user-agent'] || 'unknown',
                browser: req.headers['user-agent'] || 'unknown'
            },
            timestamp: new Date()
        });

        await shareRecord.save();

        res.status(200).json({
            success: true,
            message: 'Share tracked successfully'
        });

    } catch (error) {
        console.error('Error tracking share:', error);
        res.status(200).json({
            success: true,
            message: 'Share tracked'
        });
    }
};

// GET SHARE ANALYTICS (ADMIN)
const getShareAnalytics = async (req, res) => {
    try {
        const { startDate, endDate, platform } = req.query;

        const filter = {};
        if (startDate || endDate) {
            filter.timestamp = {};
            if (startDate) filter.timestamp.$gte = new Date(startDate);
            if (endDate) filter.timestamp.$lte = new Date(endDate);
        }
        if (platform) filter.platform = platform;

        const analytics = await ShareAnalytics.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: {
                        platform: '$platform',
                        date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $group: {
                    _id: '$_id.platform',
                    totalShares: { $sum: '$count' },
                    dailyStats: {
                        $push: {
                            date: '$_id.date',
                            count: '$count'
                        }
                    }
                }
            },
            { $sort: { totalShares: -1 } }
        ]);

        res.status(200).json({
            success: true,
            analytics
        });

    } catch (error) {
        console.error('Error fetching share analytics:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching analytics',
            error: error.message
        });
    }
};

// GET STATISTICS (ADMIN)
const getStatistics = async (req, res) => {
    try {
        const [
            totalReviews,
            averageRating,
            totalShares,
            pendingReviews
        ] = await Promise.all([
            AppReview.countDocuments({ status: 'approved' }),
            AppReview.aggregate([
                { $match: { status: 'approved' } },
                { $group: { _id: null, average: { $avg: '$rating' } } }
            ]),
            ShareAnalytics.countDocuments(),
            AppReview.countDocuments({ status: 'pending' })
        ]);

        const platformStats = await ShareAnalytics.aggregate([
            { $group: { _id: '$platform', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        res.status(200).json({
            success: true,
            statistics: {
                totalReviews: totalReviews,
                averageRating: averageRating[0]?.average?.toFixed(1) || '0.0',
                totalShares: totalShares,
                pendingReviews: pendingReviews,
                platformStats: platformStats
            }
        });

    } catch (error) {
        console.error('Error fetching statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching statistics',
            error: error.message
        });
    }
};

// ✅ CORRECT EXPORT SYNTAX - FIXED!
module.exports = {
    submitReview: submitReview,
    getReviews: getReviews,
    getUserReview: getUserReview,
    trackShare: trackShare,
    getShareAnalytics: getShareAnalytics,
    getStatistics: getStatistics
};