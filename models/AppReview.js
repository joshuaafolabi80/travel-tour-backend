// travel-tour-backend/models/AppReview.js

const mongoose = require('mongoose');

const AppReviewSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    userName: {
        type: String,
        required: true
    },
    userEmail: {
        type: String,
        required: true
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    review: {
        type: String,
        default: ''
    },
    appStore: {
        type: String,
        enum: ['google-play', 'apple-store', 'huawei', 'samsung', 'web'],
        default: 'web'
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    isFeatured: {
        type: Boolean,
        default: false
    },
    deviceInfo: {
        deviceType: String,
        os: String,
        browser: String
    },
    helpfulVotes: {
        type: Number,
        default: 0
    },
    unhelpfulVotes: {
        type: Number,
        default: 0
    },
    reportCount: {
        type: Number,
        default: 0
    },
    adminResponse: {
        text: String,
        respondedBy: String,
        respondedAt: Date
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('AppReview', AppReviewSchema);