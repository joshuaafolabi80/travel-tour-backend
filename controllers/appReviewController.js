// travel-tour-backend/controllers/appReviewController.js
const AppReview = require('../models/AppReview');
const ShareAnalytics = require('../models/ShareAnalytics');

// ✅ SUBMIT REVIEW
exports.submitReview = async (req, res) => {
    try {
        console.log('📝 Review submission request received');
        const { rating, review, appStore, deviceInfo } = req.body;

        // Validation
        if (!rating) {
            return res.status(400).json({
                success: false,
                message: 'Rating is required'
            });
        }

        // Create new review from request data and authenticated user
        const newReview = new AppReview({
            userId: req.user.id,
            userName: req.user.name || 'Anonymous',
            userEmail: req.user.email,
            rating,
            review: review || '',
            appStore: appStore || 'web',
            deviceInfo: deviceInfo || {}
        });

        await newReview.save();

        res.status(201).json({
            success: true,
            message: 'Review submitted successfully and is pending approval',
            data: newReview
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

// ✅ GET REVIEWS (ADMIN - PENDING)
exports.getReviews = async (req, res) => {
    try {
        const reviews = await AppReview.find({ status: 'pending' }).sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            count: reviews.length,
            reviews: reviews,
            message: reviews.length > 0 ? 'Pending reviews fetched' : 'No pending reviews'
        });
    } catch (error) {
        console.error('Error in getReviews:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// ✅ GET USER REVIEW
exports.getUserReview = async (req, res) => {
    try {
        const review = await AppReview.findOne({ userId: req.user.id });
        res.status(200).json({
            success: true,
            review: review || null,
            message: review ? 'User review found' : 'No review found for user'
        });
    } catch (error) {
        console.error('Error in getUserReview:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// ✅ TRACK SHARE
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

// ✅ GET ANALYTICS
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

// ✅ GET STATISTICS
exports.getStatistics = async (req, res) => {
    try {
        const totalReviews = await AppReview.countDocuments({ status: 'approved' });
        const pendingReviews = await AppReview.countDocuments({ status: 'pending' });
        
        res.status(200).json({
            success: true,
            statistics: {
                totalReviews,
                pendingReviews,
                totalShares: 0,
                averageRating: 0 
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

// ✅ UPDATE REVIEW STATUS (ADMIN)
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

// ✅ GET PUBLIC REVIEWS (NO AUTH REQUIRED)
exports.getPublicReviews = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            rating,
            sortBy = 'createdAt',
            sortOrder = 'desc',
            platform = 'all'
        } = req.query;

        const filter = { status: 'approved' };
        
        if (rating && rating !== 'all') {
            filter.rating = parseInt(rating);
        }
        
        if (platform && platform !== 'all') {
            filter.appStore = platform;
        }

        const skip = (page - 1) * limit;
        const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

        // Fetch reviews - No populate needed since userName is in the schema
        const reviews = await AppReview.find(filter)
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit))
            .select('-userEmail -reportCount -unhelpfulVotes')
            .lean();

        const totalReviews = await AppReview.countDocuments({ status: 'approved' });
        
        const averageResult = await AppReview.aggregate([
            { $match: { status: 'approved' } },
            { $group: { _id: null, average: { $avg: '$rating' } } }
        ]);
        
        const ratingDist = await AppReview.aggregate([
            { $match: { status: 'approved' } },
            { 
                $group: { 
                    _id: '$rating', 
                    count: { $sum: 1 } 
                } 
            },
            { $sort: { _id: -1 } }
        ]);

        const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        ratingDist.forEach(item => {
            ratingDistribution[item._id] = item.count;
        });

        res.status(200).json({
            success: true,
            reviews,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalReviews,
                pages: Math.ceil(totalReviews / limit)
            },
            stats: {
                averageRating: averageResult[0]?.average?.toFixed(1) || '0.0',
                totalReviews,
                ratingDistribution
            }
        });

    } catch (error) {
        console.error('Error fetching public reviews:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching reviews'
        });
    }
};

// ✅ MARK HELPFUL
exports.markHelpful = async (req, res) => {
    try {
        const { reviewId } = req.params;
        
        const review = await AppReview.findByIdAndUpdate(
            reviewId,
            { $inc: { helpfulVotes: 1 } },
            { new: true }
        );

        if (!review) {
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Marked as helpful',
            helpfulVotes: review.helpfulVotes
        });
    } catch (error) {
        console.error('❌ Error marking helpful:', error);
        res.status(500).json({
            success: false,
            message: 'Error marking helpful'
        });
    }
};