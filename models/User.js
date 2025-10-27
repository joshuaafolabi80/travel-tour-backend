// server/models/User.js (FIXED VERSION - NO CONFLICTS)
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['student', 'admin'],
    default: 'student'
  },
  active: { 
    type: Boolean, 
    default: true 
  },
  profile: {
    firstName: String,
    lastName: String,
    phone: String,
    address: String,
    bio: String,
    avatar: String
  },
  stats: {
    coursesCompleted: { type: Number, default: 0 },
    quizzesTaken: { type: Number, default: 0 },
    averageScore: { type: Number, default: 0 },
    lastLogin: Date,
    loginCount: { type: Number, default: 0 }
  },
  preferences: {
    emailNotifications: { type: Boolean, default: true },
    pushNotifications: { type: Boolean, default: true }
  },
  unreadMessages: {
    type: Number,
    default: 0
  },
  adminMessageCount: {
    type: Number,
    default: 0
  },
  lastMessageRead: {
    type: Date,
    default: Date.now
  },
  
  // NEW FIELDS FOR COURSE NOTIFICATIONS AND MASTERCLASS ACCESS
  generalCoursesCount: {
    type: Number,
    default: 0
  },
  masterclassCoursesCount: {
    type: Number,
    default: 0
  },
  masterclassAccess: [{
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    courseType: {
      type: String,
      enum: ['destination', 'document'],
      required: true
    },
    accessedAt: {
      type: Date,
      default: Date.now
    },
    accessCode: {
      type: String,
      required: true
    },
    expiresAt: {
      type: Date,
      default: function() {
        // Default expiration 1 year from access
        const oneYearFromNow = new Date();
        oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
        return oneYearFromNow;
      }
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  lastCourseNotificationCheck: {
    type: Date,
    default: Date.now
  },
  // NEW: Field to track accessible masterclass courses
  accessibleMasterclassCourses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DocumentCourse'
  }],
  
  // 🚨 FIXED: Renamed to avoid conflict with array field above
  masterclassVideoAccess: {
    type: Boolean,
    default: false
  },
  masterclassVideoAccessGrantedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Role validation safeguard - Ensure role is always valid
userSchema.pre('save', function(next) {
  // Ensure role is always valid
  if (!['student', 'admin'].includes(this.role)) {
    this.role = 'student'; // Default to student if invalid
  }
  next();
});

// Compare password method
userSchema.methods.correctPassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to increment unread messages
userSchema.methods.incrementUnreadMessages = async function() {
  this.unreadMessages += 1;
  this.adminMessageCount += 1;
  return this.save();
};

// Method to mark messages as read
userSchema.methods.markMessagesAsRead = function() {
  this.unreadMessages = 0;
  this.adminMessageCount = 0;
  this.lastMessageRead = new Date();
  return this.save();
};

// Method to reset admin message count only
userSchema.methods.resetAdminMessageCount = function() {
  this.adminMessageCount = 0;
  return this.save();
};

// NEW METHODS FOR COURSE MANAGEMENT

// Method to increment course notification counts
userSchema.methods.incrementCourseNotification = function(courseType) {
  if (courseType === 'general') {
    this.generalCoursesCount += 1;
  } else if (courseType === 'masterclass') {
    this.masterclassCoursesCount += 1;
  }
  return this.save();
};

// Method to reset course notification counts
userSchema.methods.resetCourseNotifications = function(courseType) {
  if (courseType === 'general') {
    this.generalCoursesCount = 0;
  } else if (courseType === 'masterclass') {
    this.masterclassCoursesCount = 0;
  }
  this.lastCourseNotificationCheck = new Date();
  return this.save();
};

// Method to add masterclass access
userSchema.methods.addMasterclassAccess = function(accessData) {
  const { courseId, courseType, accessCode, expiresAt } = accessData;
  
  // Remove existing access for this course if any
  this.masterclassAccess = this.masterclassAccess.filter(
    access => !(access.courseId.equals(courseId) && access.courseType === courseType)
  );
  
  // Add new access
  this.masterclassAccess.push({
    courseId,
    courseType,
    accessCode,
    expiresAt: expiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year default
    accessedAt: new Date(),
    isActive: true
  });
  
  return this.save();
};

// Method to check if user has access to a masterclass course
userSchema.methods.hasMasterclassAccess = function(courseId, courseType) {
  const now = new Date();
  return this.masterclassAccess.some(access => 
    access.courseId.equals(courseId) && 
    access.courseType === courseType &&
    access.isActive &&
    access.expiresAt > now
  );
};

// Method to get active masterclass accesses
userSchema.methods.getActiveMasterclassAccesses = function() {
  const now = new Date();
  return this.masterclassAccess.filter(access => 
    access.isActive && access.expiresAt > now
  );
};

// Method to revoke masterclass access
userSchema.methods.revokeMasterclassAccess = function(courseId, courseType) {
  const accessIndex = this.masterclassAccess.findIndex(access => 
    access.courseId.equals(courseId) && access.courseType === courseType
  );
  
  if (accessIndex !== -1) {
    this.masterclassAccess[accessIndex].isActive = false;
    return this.save();
  }
  
  return this;
};

// NEW: Method to add accessible masterclass course
userSchema.methods.addAccessibleMasterclassCourse = function(courseId) {
  if (!this.accessibleMasterclassCourses.includes(courseId)) {
    this.accessibleMasterclassCourses.push(courseId);
  }
  return this.save();
};

// NEW: Method to check if user has access to masterclass course
userSchema.methods.hasAccessToMasterclassCourse = function(courseId) {
  return this.accessibleMasterclassCourses.includes(courseId);
};

// NEW: Method to get accessible masterclass courses
userSchema.methods.getAccessibleMasterclassCourses = function() {
  return this.accessibleMasterclassCourses;
};

// 🚨 FIXED: Methods for simple masterclass access (for video system) - UPDATED FIELD NAMES

// Method to grant masterclass access FOR VIDEOS
userSchema.methods.grantMasterclassAccess = function() {
  this.masterclassVideoAccess = true;
  this.masterclassVideoAccessGrantedAt = new Date();
  return this.save();
};

// Method to revoke masterclass access FOR VIDEOS
userSchema.methods.revokeMasterclassAccessSimple = function() {
  this.masterclassVideoAccess = false;
  this.masterclassVideoAccessGrantedAt = null;
  return this.save();
};

// Method to check if user has masterclass access FOR VIDEOS
userSchema.methods.hasMasterclassAccessSimple = function() {
  return this.masterclassVideoAccess === true;
};

// Method to get masterclass access info FOR VIDEOS
userSchema.methods.getMasterclassAccessInfo = function() {
  return {
    hasAccess: this.masterclassVideoAccess,
    grantedAt: this.masterclassVideoAccessGrantedAt,
    isActive: this.masterclassVideoAccess === true
  };
};

// Method to get total notification count
userSchema.methods.getTotalNotificationCount = function() {
  return this.unreadMessages + this.generalCoursesCount + this.masterclassCoursesCount;
};

// Method to get course statistics
userSchema.methods.getCourseStats = function() {
  const now = new Date();
  const activeMasterclassAccesses = this.masterclassAccess.filter(access => 
    access.isActive && access.expiresAt > now
  );
  
  return {
    generalCoursesCount: this.generalCoursesCount,
    masterclassCoursesCount: this.masterclassCoursesCount,
    masterclassAccessCount: activeMasterclassAccesses.length,
    accessibleMasterclassCoursesCount: this.accessibleMasterclassCourses.length,
    masterclassVideoAccess: this.masterclassVideoAccess, // 🚨 FIXED: Updated field name
    masterclassVideoAccessGrantedAt: this.masterclassVideoAccessGrantedAt, // 🚨 FIXED: Updated field name
    totalNotifications: this.getTotalNotificationCount(),
    lastNotificationCheck: this.lastCourseNotificationCheck
  };
};

// Method to update last login
userSchema.methods.updateLastLogin = function() {
  this.stats.lastLogin = new Date();
  this.stats.loginCount += 1;
  return this.save();
};

// Method to complete a course
userSchema.methods.completeCourse = function() {
  this.stats.coursesCompleted += 1;
  return this.save();
};

// Method to update quiz stats
userSchema.methods.updateQuizStats = function(score) {
  this.stats.quizzesTaken += 1;
  
  // Update average score
  const currentTotal = (this.stats.averageScore * (this.stats.quizzesTaken - 1)) || 0;
  this.stats.averageScore = (currentTotal + score) / this.stats.quizzesTaken;
  
  return this.save();
};

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.profile?.firstName || ''} ${this.profile?.lastName || ''}`.trim() || this.username;
});

// Virtual for display name (first name + last initial)
userSchema.virtual('displayName').get(function() {
  if (this.profile?.firstName && this.profile?.lastName) {
    return `${this.profile.firstName} ${this.profile.lastName.charAt(0)}.`;
  }
  return this.username;
});

// Virtual for isNewUser (registered within last 7 days)
userSchema.virtual('isNewUser').get(function() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return this.createdAt > sevenDaysAgo;
});

// Index for better query performance
userSchema.index({ email: 1 });
userSchema.index({ role: 1, active: 1 });
userSchema.index({ 'masterclassAccess.courseId': 1 });
userSchema.index({ 'masterclassAccess.expiresAt': 1 });
userSchema.index({ lastCourseNotificationCheck: 1 });
userSchema.index({ accessibleMasterclassCourses: 1 });
userSchema.index({ masterclassVideoAccess: 1 }); // 🚨 FIXED: Updated field name

// Transform output to remove password and sensitive data
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  
  // Remove sensitive information
  delete user.password;
  delete user.masterclassAccess; // Remove access codes from public responses
  
  // Add virtuals to JSON output
  user.fullName = this.fullName;
  user.displayName = this.displayName;
  user.isNewUser = this.isNewUser;
  user.hasMasterclassAccess = this.hasMasterclassAccessSimple(); // ✅ Uses the method
  
  return user;
};

// Static method to find users by role
userSchema.statics.findByRole = function(role) {
  return this.find({ role, active: true });
};

// 🚨 FIXED: Static method to find users with masterclass access
userSchema.statics.findWithMasterclassAccess = function() {
  return this.find({ masterclassVideoAccess: true, active: true });
};

// Static method to get user statistics
userSchema.statics.getPlatformStats = async function() {
  const [
    totalUsers,
    activeUsers,
    students,
    admins,
    newUsersThisWeek,
    usersWithMasterclassAccess // 🚨 FIXED: Updated field name
  ] = await Promise.all([
    this.countDocuments(),
    this.countDocuments({ active: true }),
    this.countDocuments({ role: 'student', active: true }),
    this.countDocuments({ role: 'admin', active: true }),
    this.countDocuments({ 
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } 
    }),
    this.countDocuments({ masterclassVideoAccess: true, active: true }) // 🚨 FIXED: Updated field name
  ]);
  
  return {
    totalUsers,
    activeUsers,
    students,
    admins,
    newUsersThisWeek,
    usersWithMasterclassAccess
  };
};

module.exports = mongoose.model('User', userSchema);