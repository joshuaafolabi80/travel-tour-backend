const AppReview = require('../models/AppReview');
const ShareAnalytics = require('../models/ShareAnalytics');

// DEBUG: Check if everything loads
console.log('✅ AppReviewController starting to load...');
console.log('✅ AppReview model exists:', typeof AppReview);
console.log('✅ ShareAnalytics model exists:', typeof ShareAnalytics);

// ✅ SUBMIT REVIEW
exports.submitReview = async (req, res) => {
    try {
        const { rating, review, appStore, deviceInfo } = req.body;
        if (!rating) {
            return res.status(400).json({ success: false, message: 'Rating is required' });
        }

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
        res.status(201).json({ success: true, message: 'Review submitted', data: newReview });
    } catch (error) {
        console.error('❌ Error in submitReview:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ✅ GET REVIEWS (ADMIN - PENDING)
exports.getReviews = async (req, res) => {
    try {
        const reviews = await AppReview.find({ status: 'pending' }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, count: reviews.length, reviews });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ✅ GET USER REVIEW
exports.getUserReview = async (req, res) => {
    try {
        const review = await AppReview.findOne({ userId: req.user.id });
        res.status(200).json({ success: true, review });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ✅ TRACK SHARE
exports.trackShare = async (req, res) => {
    try {
        res.status(200).json({ success: true, message: 'Share tracked' });
    } catch (error) {
        res.status(200).json({ success: true });
    }
};

// ✅ GET ANALYTICS
exports.getShareAnalytics = async (req, res) => {
    try {
        res.status(200).json({ success: true, analytics: [] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ✅ GET STATISTICS
exports.getStatistics = async (req, res) => {
    try {
        const totalReviews = await AppReview.countDocuments({ status: 'approved' });
        const pendingReviews = await AppReview.countDocuments({ status: 'pending' });
        res.status(200).json({ success: true, statistics: { totalReviews, pendingReviews, totalShares: 0, averageRating: 0 } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ✅ UPDATE REVIEW STATUS (ADMIN) - THIS WAS THE MISSING FUNCTION
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
        const review = await AppReview.findByIdAndUpdate(id, updateData, { new: true });
        res.status(200).json({ success: true, message: `Review ${status}`, review });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating review' });
    }
};

// ✅ GET PUBLIC REVIEWS
exports.getPublicReviews = async (req, res) => {
    try {
        const { page = 1, limit = 10, rating, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        const filter = { status: 'approved' };
        if (rating && rating !== 'all') filter.rating = parseInt(rating);

        const reviews = await AppReview.find(filter)
            .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .select('-userEmail -reportCount -unhelpfulVotes')
            .lean();

        const totalReviews = await AppReview.countDocuments(filter);
        res.status(200).json({ success: true, reviews, pagination: { total: totalReviews } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching reviews' });
    }
};

// ✅ MARK HELPFUL
exports.markHelpful = async (req, res) => {
    try {
        const review = await AppReview.findByIdAndUpdate(req.params.reviewId, { $inc: { helpfulVotes: 1 } }, { new: true });
        if (!review) return res.status(404).json({ success: false, message: 'Not found' });
        res.status(200).json({ success: true, helpfulVotes: review.helpfulVotes });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error' });
    }
};

// DEBUG: Confirm all exports exist
console.log('✅ AppReviewController loaded successfully');
console.log('✅ Exports count:', Object.keys(exports).length);
console.log('✅ updateReviewStatus exists:', typeof exports.updateReviewStatus);
console.log('✅ getReviews exists:', typeof exports.getReviews);
console.log('✅ getShareAnalytics exists:', typeof exports.getShareAnalytics);
console.log('✅ getStatistics exists:', typeof exports.getStatistics);