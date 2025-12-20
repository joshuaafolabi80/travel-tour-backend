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
  // 🔥 NEW FIELD: Allowed emails array for whitelist system
  allowedEmails: [{
    type: String,
    lowercase: true,
    trim: true,
    default: []
  }],
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

// Method to mark as used - UPDATED with allowedEmails check
accessCodeSchema.methods.markAsUsed = function(userId, email) {
  // For codes with allowedEmails or assignedEmail, verify email matches
  if ((this.allowedEmails && this.allowedEmails.length > 0) || this.assignedEmail) {
    const cleanEmail = email ? email.toLowerCase() : null;
    let isEmailAuthorized = false;
    
    // Check allowedEmails array first
    if (this.allowedEmails && this.allowedEmails.length > 0) {
      isEmailAuthorized = this.allowedEmails.includes(cleanEmail);
    }
    
    // Check single assignedEmail
    if (!isEmailAuthorized && this.assignedEmail) {
      isEmailAuthorized = this.assignedEmail === cleanEmail;
    }
    
    if (!isEmailAuthorized) {
      throw new Error('Email not authorized for this access code');
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

// CORRECTED: Static method to find valid access code with email validation - UPDATED with allowedEmails
accessCodeSchema.statics.findValidCode = async function(code, email = null) {
  const cleanCode = code.trim().toUpperCase();
  const cleanEmail = email ? email.trim().toLowerCase() : null;
  
  console.log('🔍 findValidCode:', { cleanCode, cleanEmail });
  
  // First find the code
  const accessCode = await this.findOne({ 
    code: cleanCode 
  })
  .populate('courseId')
  .populate('generatedBy', 'username email');
  
  if (!accessCode) {
    console.log('❌ Code not found');
    return null;
  }
  
  // Check validity
  if (!accessCode.isValid()) {
    console.log('❌ Code invalid (expired or maxed out)');
    return null;
  }
  
  // If email provided, check authorization
  if (cleanEmail) {
    let isEmailAuthorized = false;
    
    // Check allowedEmails array
    if (accessCode.allowedEmails && accessCode.allowedEmails.length > 0) {
      isEmailAuthorized = accessCode.allowedEmails.includes(cleanEmail);
    }
    
    // Check single assignedEmail
    if (!isEmailAuthorized && accessCode.assignedEmail) {
      isEmailAuthorized = accessCode.assignedEmail === cleanEmail;
    }
    
    // Generic codes (no email restrictions)
    if (!isEmailAuthorized && !accessCode.assignedEmail && 
        (!accessCode.allowedEmails || accessCode.allowedEmails.length === 0)) {
      isEmailAuthorized = true; // Generic code
    }
    
    if (!isEmailAuthorized) {
      console.log('❌ Email not authorized:', cleanEmail);
      return null;
    }
  }
  
  return accessCode;
};

// Static method to create generic access code (for admin uploads)
accessCodeSchema.statics.createGenericAccessCode = async function(data) {
  const {
    code: providedCode,
    courseId,
    courseType = 'document',
    generatedBy,
    assignedEmail = null,
    allowedEmails = [],
    maxUsageCount = 1,
    expiresAt = null
  } = data;
  
  // Use provided code or generate one
  const code = providedCode ? providedCode : await this.generateUniqueCode();
  
  // If provided code exists, check for duplicates to be safe
  if (providedCode) {
    const existing = await this.findOne({ code: providedCode });
    if (existing) {
      throw new Error(`Access code '${providedCode}' already exists`);
    }
  }
  
  const accessCode = new this({
    code,
    courseId,
    courseType,
    generatedBy,
    assignedEmail: assignedEmail ? assignedEmail.toLowerCase().trim() : null,
    allowedEmails: allowedEmails.map(email => email.toLowerCase().trim()),
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
    code: providedCode,
    courseId,
    courseType = 'document',
    generatedBy,
    assignedEmail, // REQUIRED for assigned codes
    allowedEmails = [],
    maxUsageCount = 1,
    expiresAt = null
  } = data;
  
  if (!assignedEmail) {
    throw new Error('assignedEmail is required for assigned access codes');
  }
  
  // Use provided code or generate one
  const code = providedCode ? providedCode : await this.generateUniqueCode();
  
  // If provided code exists, check for duplicates to be safe
  if (providedCode) {
    const existing = await this.findOne({ code: providedCode });
    if (existing) {
      throw new Error(`Access code '${providedCode}' already exists`);
    }
  }
  
  const accessCode = new this({
    code,
    courseId,
    courseType,
    generatedBy,
    assignedEmail: assignedEmail.toLowerCase().trim(),
    allowedEmails: allowedEmails.map(email => email.toLowerCase().trim()),
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
      { allowedEmails: email.toLowerCase() },
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