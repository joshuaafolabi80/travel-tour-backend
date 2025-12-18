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
      const hundredYearsFromNow = new Date();
      hundredYearsFromNow.setFullYear(hundredYearsFromNow.getFullYear() + 100);
      return hundredYearsFromNow;
    }
  },
  // NEW FIELD: User email this code is assigned to (OPTIONAL for admin uploads)
  assignedEmail: {
    type: String,
    lowercase: true,
    trim: true,
    default: null // Changed from required to optional
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
  },
  // NEW FIELD: Type of access code
  codeType: {
    type: String,
    enum: ['generic', 'assigned'],
    default: 'generic'
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
accessCodeSchema.index({ codeType: 1 });

// Method to check if access code is valid
accessCodeSchema.methods.isValid = function() {
  const now = new Date();
  const notExpired = this.expiresAt > now;
  const notMaxedOut = this.currentUsageCount < this.maxUsageCount;
  
  return notExpired && notMaxedOut;
};

// Method to mark as used - UPDATED to handle both generic and assigned codes
accessCodeSchema.methods.markAsUsed = function(userId, email) {
  // For assigned codes, verify email matches if provided
  if (this.codeType === 'assigned' && email && this.assignedEmail) {
    if (this.assignedEmail.toLowerCase() !== email.toLowerCase()) {
      throw new Error('Access code not assigned to this email');
    }
  }
  
  // For generic codes (admin uploaded courses), assign the email on first use
  if (this.codeType === 'generic' && email && !this.assignedEmail) {
    this.assignedEmail = email.toLowerCase();
    this.codeType = 'assigned'; // Convert to assigned after first use
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
    
    const existingCode = await this.findOne({ code });
    if (!existingCode) {
      isUnique = true;
    }
  }
  
  return code;
};

// CORRECTED: Static method to find valid access code with email validation
accessCodeSchema.statics.findValidCode = async function(code, email = null) {
  // Simple query - find all non-expired codes with this code
  const query = {
    code: code,
    expiresAt: { $gt: new Date() }
  };
  
  // If email provided, handle both generic and assigned codes
  if (email) {
    query.$or = [
      { assignedEmail: email.toLowerCase() },
      { 
        codeType: 'generic',
        assignedEmail: null
      }
    ];
  }
  
  const accessCode = await this.findOne(query)
    .populate('courseId')
    .populate('generatedBy', 'username email');
  
  // Manually check usage count in JavaScript
  if (accessCode && accessCode.currentUsageCount >= accessCode.maxUsageCount) {
    return null; // Usage limit reached
  }
  
  return accessCode;
};

// Static method to create generic access code (for admin uploads)
accessCodeSchema.statics.createGenericAccessCode = async function(data) {
  const {
    courseId,
    courseType = 'document',
    generatedBy,
    assignedEmail = null, // Optional for admin uploads
    maxUsageCount = 1,
    expiresAt = null
  } = data;
  
  const code = await this.generateUniqueCode();
  
  const accessCode = new this({
    code,
    courseId,
    courseType,
    generatedBy,
    assignedEmail: assignedEmail ? assignedEmail.toLowerCase().trim() : null,
    maxUsageCount,
    codeType: assignedEmail ? 'assigned' : 'generic',
    expiresAt: expiresAt || new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000)
  });
  
  await accessCode.save();
  return accessCode;
};

// Static method to create assigned access code with email requirement
accessCodeSchema.statics.createAssignedAccessCode = async function(data) {
  const {
    courseId,
    courseType = 'document',
    generatedBy,
    assignedEmail, // REQUIRED for assigned codes
    maxUsageCount = 1,
    expiresAt = null
  } = data;
  
  if (!assignedEmail) {
    throw new Error('assignedEmail is required for assigned access codes');
  }
  
  const code = await this.generateUniqueCode();
  
  const accessCode = new this({
    code,
    courseId,
    courseType,
    generatedBy,
    assignedEmail: assignedEmail.toLowerCase().trim(),
    maxUsageCount,
    codeType: 'assigned',
    expiresAt: expiresAt || new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000)
  });
  
  await accessCode.save();
  return accessCode;
};

// Static method to get access codes by assigned email
accessCodeSchema.statics.findByAssignedEmail = function(email) {
  return this.find({ 
    $or: [
      { assignedEmail: email.toLowerCase() },
      { 
        codeType: 'generic',
        assignedEmail: null
      }
    ]
  })
    .populate('courseId', 'title courseType')
    .populate('usedBy', 'username email')
    .populate('generatedBy', 'username email')
    .sort({ createdAt: -1 });
};

// Static method to find generic codes (no email assigned)
accessCodeSchema.statics.findGenericCodes = function(courseId = null) {
  const query = { 
    codeType: 'generic',
    assignedEmail: null
  };
  
  if (courseId) {
    query.courseId = courseId;
  }
  
  return this.find(query)
    .populate('courseId', 'title courseType')
    .populate('generatedBy', 'username email')
    .sort({ createdAt: -1 });
};

const AccessCode = mongoose.model('AccessCode', accessCodeSchema);

module.exports = AccessCode;