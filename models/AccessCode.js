// server/models/AccessCode.js
const mongoose = require('mongoose');

const accessCodeSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DocumentCourse', // Changed from 'Course' to 'DocumentCourse'
    required: true
  },
  courseType: {
    type: String,
    enum: ['document', 'destination'],
    default: 'document',
    required: true
  },
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  usedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  usedAt: {
    type: Date,
    default: null
  },
  isUsed: {
    type: Boolean,
    default: false
  },
  expiresAt: {
    type: Date,
    required: true,
    default: function() {
      // Default expiration 1 year from creation
      const oneYearFromNow = new Date();
      oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
      return oneYearFromNow;
    }
  }
}, {
  timestamps: true
});

// Index for better query performance
accessCodeSchema.index({ code: 1 });
accessCodeSchema.index({ courseId: 1 });
accessCodeSchema.index({ isUsed: 1, expiresAt: 1 });
accessCodeSchema.index({ usedBy: 1 });
accessCodeSchema.index({ generatedBy: 1 });

// Method to check if access code is valid
accessCodeSchema.methods.isValid = function() {
  const now = new Date();
  return !this.isUsed && this.expiresAt > now;
};

// Method to mark as used
accessCodeSchema.methods.markAsUsed = function(userId) {
  this.isUsed = true;
  this.usedBy = userId;
  this.usedAt = new Date();
  return this.save();
};

// Static method to generate unique access code
accessCodeSchema.statics.generateUniqueCode = async function() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  let isUnique = false;
  
  while (!isUnique) {
    code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    // Check if code already exists
    const existingCode = await this.findOne({ code });
    if (!existingCode) {
      isUnique = true;
    }
  }
  
  return code;
};

// Static method to find valid access code
accessCodeSchema.statics.findValidCode = function(code) {
  return this.findOne({
    code: code,
    isUsed: false,
    expiresAt: { $gt: new Date() }
  }).populate('courseId').populate('generatedBy', 'username email');
};

// Static method to get access codes by course
accessCodeSchema.statics.findByCourse = function(courseId) {
  return this.find({ courseId })
    .populate('usedBy', 'username email')
    .populate('generatedBy', 'username email')
    .sort({ createdAt: -1 });
};

// Static method to get access codes by generator
accessCodeSchema.statics.findByGenerator = function(userId) {
  return this.find({ generatedBy: userId })
    .populate('courseId', 'title courseType')
    .populate('usedBy', 'username email')
    .sort({ createdAt: -1 });
};

// Static method to get unused access codes
accessCodeSchema.statics.findUnusedCodes = function() {
  return this.find({
    isUsed: false,
    expiresAt: { $gt: new Date() }
  }).populate('courseId', 'title courseType').populate('generatedBy', 'username email');
};

// Static method to get expired access codes
accessCodeSchema.statics.findExpiredCodes = function() {
  return this.find({
    expiresAt: { $lt: new Date() }
  }).populate('courseId', 'title').populate('generatedBy', 'username');
};

// Static method to clean up expired access codes (for cron job)
accessCodeSchema.statics.cleanupExpiredCodes = async function() {
  const result = await this.deleteMany({
    expiresAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Delete codes expired more than 30 days ago
  });
  return result;
};

// Virtual for days until expiration
accessCodeSchema.virtual('daysUntilExpiration').get(function() {
  const now = new Date();
  const diffTime = this.expiresAt - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
});

// Virtual for isExpired
accessCodeSchema.virtual('isExpired').get(function() {
  return new Date() > this.expiresAt;
});

// Virtual for isActive (not used and not expired)
accessCodeSchema.virtual('isActive').get(function() {
  return !this.isUsed && !this.isExpired;
});

const AccessCode = mongoose.model('AccessCode', accessCodeSchema);

module.exports = AccessCode;