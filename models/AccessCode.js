// travel-tour-backend/models/AccessCode.js - FIXED
const mongoose = require('mongoose');

const accessCodeSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    // Ref can be dynamic since we use both DocumentCourse and Course (Destinations)
    refPath: 'courseModel' 
  },
  courseModel: {
    type: String,
    required: true,
    enum: ['DocumentCourse', 'Course', 'VideoCourse'],
    default: 'DocumentCourse'
  },
  courseType: {
    type: String,
    enum: ['document', 'destination', 'video', 'masterclass'],
    default: 'document',
    required: true
  },
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // track last user who used it
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
      const hundredYearsFromNow = new Date();
      hundredYearsFromNow.setFullYear(hundredYearsFromNow.getFullYear() + 100);
      return hundredYearsFromNow;
    }
  },
  // Primary email assigned to this code
  assignedEmail: {
    type: String,
    lowercase: true,
    trim: true,
    default: null
  },
  // 🔥 Whitelist: Only emails in this array (or assignedEmail) can use this code
  allowedEmails: [{
    type: String,
    lowercase: true,
    trim: true
  }],
  // Maximum number of different times/users this code can be used
  maxUsageCount: {
    type: Number,
    default: 1
  },
  currentUsageCount: {
    type: Number,
    default: 0
  },
  codeType: {
    type: String,
    enum: ['generic', 'assigned'],
    default: 'generic'
  },
  assignedUserName: {  // ADD THIS FIELD - it's referenced in the admin.js
    type: String,
    trim: true,
    default: ''
  }
}, {
  timestamps: true
});

// Add indexes for better performance
accessCodeSchema.index({ code: 1 });
accessCodeSchema.index({ courseId: 1 });
accessCodeSchema.index({ assignedEmail: 1 });
accessCodeSchema.index({ expiresAt: 1 });

const AccessCode = mongoose.model('AccessCode', accessCodeSchema);

module.exports = AccessCode;