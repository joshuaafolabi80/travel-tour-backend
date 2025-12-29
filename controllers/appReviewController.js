// Add this function to your existing controller
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

        // Only show APPROVED reviews to public
        const filter = { status: 'approved' };
        
        if (rating && rating !== 'all') {
            filter.rating = parseInt(rating);
        }
        
        if (platform && platform !== 'all') {
            filter.appStore = platform;
        }

        const skip = (page - 1) * limit;
        const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

        // Get reviews with user info
        const reviews = await AppReview.find(filter)
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit))
            .populate('userId', 'name email')
            .select('-userEmail -reportCount -unhelpfulVotes') // Hide sensitive data
            .lean();

        // Get stats for public display
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

        // Format rating distribution
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

// Add helpful vote endpoint
exports.markHelpful = async (req, res) => {
    try {
        const { reviewId } = req.params;
        
        await AppReview.findByIdAndUpdate(
            reviewId,
            { $inc: { helpfulVotes: 1 } }
        );

        res.status(200).json({
            success: true,
            message: 'Marked as helpful'
        });
    } catch (error) {
        console.error('Error marking helpful:', error);
        res.status(500).json({
            success: false,
            message: 'Error marking helpful'
        });
    }
};