const AppReview = require('../models/AppReview');

// ✅ SUBMIT REVIEW
exports.submitReview = async (req, res) => {
    try {
        const { rating, review, appStore, deviceInfo } = req.body;
        if (!rating) return res.status(400).json({ success: false, message: 'Rating is required' });

        // Upsert logic: Update if user already reviewed, else create new
        const existingReview = await AppReview.findOne({ userId: req.user.id });
        
        if (existingReview) {
            existingReview.rating = rating;
            existingReview.review = review;
            existingReview.status = 'pending'; // Re-verify on update
            await existingReview.save();
            return res.status(200).json({ success: true, message: 'Review updated', data: existingReview });
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
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ✅ GET PUBLIC REVIEWS (With Stats for Frontend)
exports.getPublicReviews = async (req, res) => {
    try {
        const { rating, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        const filter = { status: 'approved' };
        if (rating) filter.rating = parseInt(rating);

        const reviews = await AppReview.find(filter)
            .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
            .lean();

        // Calculate Stats
        const allApproved = await AppReview.find({ status: 'approved' });
        const total = allApproved.length;
        const sum = allApproved.reduce((acc, curr) => acc + curr.rating, 0);
        const averageRating = total > 0 ? (sum / total).toFixed(1) : 0;

        const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        allApproved.forEach(r => ratingDistribution[r.rating]++);

        res.status(200).json({ 
            success: true, 
            reviews, 
            stats: { averageRating, ratingDistribution, totalReviews: total } 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching reviews' });
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
        
        const review = await AppReview.findByIdAndUpdate(id, updateData, { new: true });
        res.status(200).json({ success: true, message: `Review ${status}`, review });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating review' });
    }
};

// ✅ REMAINING STUBS
exports.getReviews = async (req, res) => {
    const reviews = await AppReview.find({ status: 'pending' }).sort({ createdAt: -1 });
    res.json({ success: true, reviews });
};
exports.getUserReview = async (req, res) => {
    const review = await AppReview.findOne({ userId: req.user.id });
    res.json({ success: true, review });
};
exports.trackShare = async (req, res) => res.json({ success: true });
exports.getShareAnalytics = async (req, res) => res.json({ success: true, analytics: [] });
exports.getStatistics = async (req, res) => {
    const total = await AppReview.countDocuments({ status: 'approved' });
    const pending = await AppReview.countDocuments({ status: 'pending' });
    res.json({ success: true, statistics: { totalReviews: total, pendingReviews: pending } });
};
exports.markHelpful = async (req, res) => {
    const review = await AppReview.findByIdAndUpdate(req.params.reviewId, { $inc: { helpfulVotes: 1 } }, { new: true });
    res.json({ success: true, helpfulVotes: review?.helpfulVotes || 0 });
};