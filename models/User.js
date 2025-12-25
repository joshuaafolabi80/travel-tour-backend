// server/models/User.js (UPDATED WITH GOOGLE OAUTH INTEGRATION)
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    trim: true,
    // Make username optional for Google users
    // required: function() { return this.authProvider === 'email'; }
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  password: {
    type: String,
    // Password required only for email/password users, not for Google users
    required: function() { return this.authProvider === 'email'; }
  },
  
  // GOOGLE OAUTH FIELDS - NEW
  googleId: {
    type: String,
    unique: true,
    sparse: true // Allows null values while maintaining uniqueness
  },
  authProvider: {
    type: String,
    enum: ['email', 'google'],
    default: 'email'
  },
  profilePicture: {
    type: String,
    default: ''
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
    loginCount: { type: Number, default: 0 },
    // Add Google-specific stats
    googleSignInCount: { type: Number, default: 0 },
    lastGoogleSignIn: Date
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
  
  // COURSE NOTIFICATIONS AND MASTERCLASS ACCESS
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
  // Field to track accessible masterclass courses
  accessibleMasterclassCourses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DocumentCourse'
  }],
  
  // VIDEO-SPECIFIC FIELDS
  masterclassVideoAccess: {
    type: Boolean,
    default: false
  },
  masterclassVideoAccessGrantedAt: {
    type: Date
  },
  
  // GOOGLE-SPECIFIC ADDITIONS
  emailVerified: {
    type: Boolean,
    default: false
  },
  googleProfile: {
    locale: String,
    verifiedEmail: Boolean,
    givenName: String,
    familyName: String
  },
  lastOAuthLogin: {
    type: Date
  }
}, {
  timestamps: true
});

// Hash password before saving (only for email users)
userSchema.pre('save', async function(next) {
  // Only hash password if it's modified and user uses email authentication
  if (!this.isModified('password') || this.authProvider !== 'email') return next();
  
  // Only hash if password exists (Google users won't have passwords)
  if (this.password) {
    this.password = await bcrypt.hash(this.password, 12);
  }
  next();
});

// Role validation safeguard
userSchema.pre('save', function(next) {
  if (!['student', 'admin'].includes(this.role)) {
    this.role = 'student';
  }
  next();
});

// NEW: Set default username for Google users
userSchema.pre('save', function(next) {
  // Generate username for Google users if not provided
  if (this.authProvider === 'google' && !this.username) {
    if (this.profile?.firstName && this.profile?.lastName) {
      this.username = `${this.profile.firstName}${this.profile.lastName}`.toLowerCase();
    } else if (this.email) {
      this.username = this.email.split('@')[0];
    } else {
      this.username = `user_${Date.now()}`;
    }
  }
  next();
});

// Compare password method (only for email users)
userSchema.methods.correctPassword = async function(candidatePassword) {
  // Google users don't have passwords
  if (this.authProvider !== 'email' || !this.password) {
    return false;
  }
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

// COURSE MANAGEMENT METHODS

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
  
  this.masterclassAccess = this.masterclassAccess.filter(
    access => !(access.courseId.equals(courseId) && access.courseType === courseType)
  );
  
  this.masterclassAccess.push({
    courseId,
    courseType,
    accessCode,
    expiresAt: expiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
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

// Method to add accessible masterclass course
userSchema.methods.addAccessibleMasterclassCourse = function(courseId) {
  if (!this.accessibleMasterclassCourses.includes(courseId)) {
    this.accessibleMasterclassCourses.push(courseId);
  }
  return this.save();
};

// Method to check if user has access to masterclass course
userSchema.methods.hasAccessToMasterclassCourse = function(courseId) {
  return this.accessibleMasterclassCourses.includes(courseId);
};

// Method to get accessible masterclass courses
userSchema.methods.getAccessibleMasterclassCourses = function() {
  return this.accessibleMasterclassCourses;
};

// VIDEO-SPECIFIC METHODS

// Method to grant masterclass access FOR VIDEOS
userSchema.methods.grantMasterclassAccessSimple = function() {
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

// GOOGLE OAUTH-SPECIFIC METHODS - NEW

// Method to handle Google OAuth login/registration
userSchema.statics.findOrCreateGoogleUser = async function(googleProfile) {
  const { sub: googleId, email, name, picture, given_name, family_name, locale, email_verified } = googleProfile;
  
  // Try to find by Google ID first
  let user = await this.findOne({ googleId });
  
  if (user) {
    // Update existing Google user
    user.lastOAuthLogin = new Date();
    user.stats.googleSignInCount += 1;
    user.stats.lastGoogleSignIn = new Date();
    user.stats.loginCount += 1;
    user.stats.lastLogin = new Date();
    
    // Update profile picture if changed
    if (picture && picture !== user.profilePicture) {
      user.profilePicture = picture;
    }
    
    await user.save();
    return user;
  }
  
  // Try to find by email (for users who might have registered with email first)
  user = await this.findOne({ email });
  
  if (user) {
    // Link Google account to existing email user
    user.googleId = googleId;
    user.authProvider = 'google'; // Switch to Google auth
    user.profilePicture = picture || user.profilePicture;
    user.lastOAuthLogin = new Date();
    user.stats.googleSignInCount = 1;
    user.stats.lastGoogleSignIn = new Date();
    user.stats.loginCount += 1;
    user.stats.lastLogin = new Date();
    
    // Update profile info from Google
    if (!user.profile?.firstName && given_name) {
      user.profile = user.profile || {};
      user.profile.firstName = given_name;
    }
    if (!user.profile?.lastName && family_name) {
      user.profile = user.profile || {};
      user.profile.lastName = family_name;
    }
    
    await user.save();
    return user;
  }
  
  // Create new Google user
  user = new this({
    email,
    googleId,
    authProvider: 'google',
    profilePicture: picture || '',
    emailVerified: email_verified || false,
    
    // Set username from Google profile
    username: name ? name.replace(/\s+/g, '').toLowerCase() : email.split('@')[0],
    
    profile: {
      firstName: given_name || '',
      lastName: family_name || '',
      avatar: picture || ''
    },
    
    googleProfile: {
      locale: locale || '',
      verifiedEmail: email_verified || false,
      givenName: given_name || '',
      familyName: family_name || ''
    },
    
    lastOAuthLogin: new Date(),
    stats: {
      googleSignInCount: 1,
      lastGoogleSignIn: new Date(),
      loginCount: 1,
      lastLogin: new Date()
    }
  });
  
  await user.save();
  return user;
};

// Method to convert email user to Google user
userSchema.methods.convertToGoogleAuth = async function(googleProfile) {
  const { sub: googleId, picture, given_name, family_name } = googleProfile;
  
  this.googleId = googleId;
  this.authProvider = 'google';
  this.profilePicture = picture || this.profilePicture;
  this.lastOAuthLogin = new Date();
  
  // Remove password since user will use Google auth
  this.password = undefined;
  
  // Update profile from Google
  if (!this.profile?.firstName && given_name) {
    this.profile = this.profile || {};
    this.profile.firstName = given_name;
  }
  if (!this.profile?.lastName && family_name) {
    this.profile = this.profile || {};
    this.profile.lastName = family_name;
  }
  
  await this.save();
  return this;
};

// Method to check if user can reset password
userSchema.methods.canResetPassword = function() {
  return this.authProvider === 'email';
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
    masterclassVideoAccess: this.masterclassVideoAccess,
    masterclassVideoAccessGrantedAt: this.masterclassVideoAccessGrantedAt,
    totalNotifications: this.getTotalNotificationCount(),
    lastNotificationCheck: this.lastCourseNotificationCheck,
    authProvider: this.authProvider,
    emailVerified: this.emailVerified
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
  
  const currentTotal = (this.stats.averageScore * (this.stats.quizzesTaken - 1)) || 0;
  this.stats.averageScore = (currentTotal + score) / this.stats.quizzesTaken;
  
  return this.save();
};

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  // For Google users, use Google profile names
  if (this.authProvider === 'google' && this.googleProfile) {
    return `${this.googleProfile.givenName || ''} ${this.googleProfile.familyName || ''}`.trim() || this.username;
  }
  return `${this.profile?.firstName || ''} ${this.profile?.lastName || ''}`.trim() || this.username;
});

// Virtual for display name
userSchema.virtual('displayName').get(function() {
  // For Google users
  if (this.authProvider === 'google' && this.googleProfile?.givenName) {
    const lastNameInitial = this.googleProfile.familyName ? this.googleProfile.familyName.charAt(0) + '.' : '';
    return `${this.googleProfile.givenName} ${lastNameInitial}`.trim();
  }
  
  if (this.profile?.firstName && this.profile?.lastName) {
    return `${this.profile.firstName} ${this.profile.lastName.charAt(0)}.`;
  }
  return this.username;
});

// Virtual for isNewUser
userSchema.virtual('isNewUser').get(function() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return this.createdAt > sevenDaysAgo;
});

// Virtual for auth type display
userSchema.virtual('authTypeDisplay').get(function() {
  return this.authProvider === 'google' ? 'Google' : 'Email';
});

// Indexes for better query performance
userSchema.index({ email: 1 });
userSchema.index({ role: 1, active: 1 });
userSchema.index({ 'masterclassAccess.courseId': 1 });
userSchema.index({ 'masterclassAccess.expiresAt': 1 });
userSchema.index({ lastCourseNotificationCheck: 1 });
userSchema.index({ accessibleMasterclassCourses: 1 });
userSchema.index({ masterclassVideoAccess: 1 });
userSchema.index({ googleId: 1 }); // NEW: Index for Google ID queries
userSchema.index({ authProvider: 1 }); // NEW: Index for auth provider queries

// Transform output to remove sensitive data
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  
  // Remove sensitive information
  delete user.password;
  delete user.masterclassAccess;
  
  // Add virtuals to JSON output
  user.fullName = this.fullName;
  user.displayName = this.displayName;
  user.isNewUser = this.isNewUser;
  user.authTypeDisplay = this.authTypeDisplay;
  user.hasMasterclassAccess = this.hasMasterclassAccessSimple();
  
  return user;
};

// Static method to find users by role
userSchema.statics.findByRole = function(role) {
  return this.find({ role, active: true });
};

// Static method to find users with masterclass access
userSchema.statics.findWithMasterclassAccess = function() {
  return this.find({ masterclassVideoAccess: true, active: true });
};

// NEW: Static method to find Google users
userSchema.statics.findGoogleUsers = function() {
  return this.find({ authProvider: 'google', active: true });
};

// Static method to get platform statistics
userSchema.statics.getPlatformStats = async function() {
  const [
    totalUsers,
    activeUsers,
    students,
    admins,
    newUsersThisWeek,
    usersWithMasterclassAccess,
    googleUsers, // NEW
    emailUsers // NEW
  ] = await Promise.all([
    this.countDocuments(),
    this.countDocuments({ active: true }),
    this.countDocuments({ role: 'student', active: true }),
    this.countDocuments({ role: 'admin', active: true }),
    this.countDocuments({ 
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } 
    }),
    this.countDocuments({ masterclassVideoAccess: true, active: true }),
    this.countDocuments({ authProvider: 'google', active: true }), // NEW
    this.countDocuments({ authProvider: 'email', active: true }) // NEW
  ]);
  
  return {
    totalUsers,
    activeUsers,
    students,
    admins,
    newUsersThisWeek,
    usersWithMasterclassAccess,
    googleUsers, // NEW
    emailUsers, // NEW
    googlePercentage: totalUsers > 0 ? (googleUsers / totalUsers * 100).toFixed(1) : 0
  };
};

module.exports = mongoose.model('User', userSchema);