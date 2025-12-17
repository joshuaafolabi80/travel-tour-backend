// travel-tour-backend/models/AccessCode.js - COMPLETE UNCHANGED
const mongoose = require('mongoose');

const accessCodeSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DocumentCourse',
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
      // Set to 100 years from now for "lifetime" access
      const hundredYearsFromNow = new Date();
      hundredYearsFromNow.setFullYear(hundredYearsFromNow.getFullYear() + 100);
      return hundredYearsFromNow;
    }
  },
  // NEW FIELD: User email this code is assigned to
  assignedEmail: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  // NEW FIELD: Maximum usage count (default 1 for single use)
  maxUsageCount: {
    type: Number,
    default: 1
  },
  // NEW FIELD: Current usage count
  currentUsageCount: {
    type: Number,
    default: 0
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
// NEW INDEX: For email-based lookup
accessCodeSchema.index({ assignedEmail: 1 });

// Method to check if access code is valid
accessCodeSchema.methods.isValid = function() {
  const now = new Date();
  const notExpired = this.expiresAt > now;
  const notMaxedOut = this.currentUsageCount < this.maxUsageCount;
  
  return notExpired && notMaxedOut;
};

// Method to mark as used
accessCodeSchema.methods.markAsUsed = function(userId, email) {
  // Verify email matches if provided
  if (email && this.assignedEmail && this.assignedEmail.toLowerCase() !== email.toLowerCase()) {
    throw new Error('Access code not assigned to this email');
  }
  
  this.currentUsageCount += 1;
  
  // If reached max usage, mark as used
  if (this.currentUsageCount >= this.maxUsageCount) {
    this.isUsed = true;
    this.usedBy = userId;
    this.usedAt = new Date();
  }
  
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

// Static method to find valid access code with email validation
accessCodeSchema.statics.findValidCode = function(code, email = null) {
  const query = {
    code: code,
    expiresAt: { $gt: new Date() },
    currentUsageCount: { $lt: '$maxUsageCount' }
  };
  
  // If email provided, verify it matches assigned email
  if (email) {
    query.assignedEmail = email.toLowerCase();
  }
  
  return this.findOne(query)
    .populate('courseId')
    .populate('generatedBy', 'username email');
};

// Static method to create access code with email assignment
accessCodeSchema.statics.createAccessCode = async function(data) {
  const {
    courseId,
    courseType = 'document',
    generatedBy,
    assignedEmail,
    maxUsageCount = 1,
    expiresAt = null
  } = data;
  
  const code = await this.generateUniqueCode();
  
  const accessCode = new this({
    code,
    courseId,
    courseType,
    generatedBy,
    assignedEmail: assignedEmail.toLowerCase().trim(),
    maxUsageCount,
    expiresAt: expiresAt || new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000) // 100 years
  });
  
  await accessCode.save();
  return accessCode;
};

// Static method to get access codes by assigned email
accessCodeSchema.statics.findByAssignedEmail = function(email) {
  return this.find({ assignedEmail: email.toLowerCase() })
    .populate('courseId', 'title courseType')
    .populate('usedBy', 'username email')
    .populate('generatedBy', 'username email')
    .sort({ createdAt: -1 });
};

const AccessCode = mongoose.model('AccessCode', accessCodeSchema);

module.exports = AccessCode;