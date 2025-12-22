const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  videoType: {
    type: String,
    enum: ['general', 'masterclass'],
    default: 'general'
  },
  category: {
    type: String,
    trim: true
  },
  videoUrl: {
    type: String,
    required: true
  },
  cloudinaryPublicId: {
    type: String,
    required: true
  },
  duration: {
    type: String
  },
  fileSize: {
    type: Number
  },
  // The primary code used for this video (for masterclass type)
  accessCode: {
    type: String,
    trim: true
  },
  // 🔥 UPDATED: Whitelist of emails allowed to view this specific video
  // Matches the structure in your AccessCode model
  allowedEmails: [{
    type: String,
    lowercase: true,
    trim: true
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for better query performance
videoSchema.index({ videoType: 1, isActive: 1 });
videoSchema.index({ uploadedAt: -1 });
videoSchema.index({ accessCode: 1 }); // Added index for code lookups

module.exports = mongoose.model('Video', videoSchema);
