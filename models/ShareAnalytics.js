const mongoose = require('mongoose');

const ShareAnalyticsSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    platform: {
        type: String,
        required: true,
        enum: [
            'whatsapp', 'facebook', 'twitter', 'instagram', 'linkedin',
            'telegram', 'email', 'sms', 'bluetooth', 'chrome', 'files',
            'gmail', 'quickshare', 'copy', 'native-share', 'other'
        ]
    },
    shareMethod: {
        type: String,
        enum: ['just-once', 'always'],
        default: 'just-once'
    },
    deviceInfo: {
        deviceType: String,
        os: String,
        browser: String,
        screenSize: String
    },
    location: {
        country: String,
        city: String,
        region: String
    },
    sessionId: String,
    referrer: String,
    timestamp: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('ShareAnalytics', ShareAnalyticsSchema);