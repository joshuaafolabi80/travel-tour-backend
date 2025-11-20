//travel-tour-backend/meet-module/models/Meeting.js

const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema({
  // 🆕 ENHANCED FIELDS FOR SEAMLESS JOIN
  meetingId: {
    type: String,
    required: true,
    unique: true
  },
  meetLink: {
    type: String,
    required: true
  },
  // 🆕 ADD DIRECT JOIN LINKS
  directJoinLink: {
    type: String
  },
  instantJoinLink: {
    type: String
  },
  meetingCode: {
    type: String
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  adminName: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  scheduledStart: {
    type: Date,
    default: Date.now
  },
  scheduledEnd: {
    type: Date,
    required: true
  },
  actualEnd: {
    type: Date
  },
  status: {
    type: String,
    enum: ['active', 'ended', 'extended'],
    default: 'active'
  },
  originalMeetingId: {
    type: String
  },
  extensions: {
    type: Number,
    default: 0
  },
  maxExtensions: {
    type: Number,
    default: 2
  },
  lastExtensionAt: {
    type: Date
  },
  participantCount: {
    type: Number,
    default: 0
  },
  // 🆕 ENHANCED PARTICIPANTS FIELD
  participants: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    userName: {
      type: String,
      required: true
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    joinMethod: {
      type: String,
      enum: ['direct', 'seamless', 'manual'],
      default: 'manual'
    },
    leftAt: {
      type: Date
    }
  }],
  expectedParticipants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  autoEndScheduled: {
    type: Boolean,
    default: true
  },
  warningSent: {
    type: Boolean,
    default: false
  },
  // 🆕 ADD SEAMLESS JOIN SETTINGS
  settings: {
    anyoneCanJoin: {
      type: Boolean,
      default: true
    },
    requiresAuthentication: {
      type: Boolean,
      default: false
    },
    canJoinBeforeHost: {
      type: Boolean,
      default: true
    },
    knockRequired: {
      type: Boolean,
      default: false
    },
    seamlessJoinEnabled: {
      type: Boolean,
      default: true
    },
    maxParticipants: {
      type: Number,
      default: 100
    },
    recordingEnabled: {
      type: Boolean,
      default: false
    },
    chatEnabled: {
      type: Boolean,
      default: true
    }
  },
  // 🆕 ADD GOOGLE CALENDAR INTEGRATION FIELDS
  googleEventId: {
    type: String
  },
  googleCalendarLink: {
    type: String
  },
  hangoutLink: {
    type: String
  },
  // 🆕 ADD METADATA FOR ANALYTICS
  metadata: {
    totalJoinAttempts: {
      type: Number,
      default: 0
    },
    successfulJoins: {
      type: Number,
      default: 0
    },
    averageJoinTime: {
      type: Number,
      default: 0
    },
    resourcesShared: {
      type: Number,
      default: 0
    }
  }
});

// Index for faster queries
meetingSchema.index({ meetingId: 1 });
meetingSchema.index({ status: 1, scheduledEnd: 1 });
meetingSchema.index({ createdBy: 1 });
meetingSchema.index({ 'settings.seamlessJoinEnabled': 1 });
meetingSchema.index({ googleEventId: 1 });

// 🆕 VIRTUAL FOR ACTIVE PARTICIPANTS COUNT
meetingSchema.virtual('activeParticipantsCount').get(function() {
  return this.participants.filter(p => !p.leftAt).length;
});

// 🆕 METHOD TO ADD PARTICIPANT
meetingSchema.methods.addParticipant = function(userId, userName, joinMethod = 'seamless') {
  const existingParticipant = this.participants.find(p => 
    p.userId.toString() === userId.toString() && !p.leftAt
  );
  
  if (!existingParticipant) {
    this.participants.push({
      userId,
      userName,
      joinMethod,
      joinedAt: new Date()
    });
    this.participantCount = this.participants.filter(p => !p.leftAt).length;
  }
  
  return this.save();
};

// 🆕 METHOD TO REMOVE PARTICIPANT
meetingSchema.methods.removeParticipant = function(userId) {
  const participant = this.participants.find(p => 
    p.userId.toString() === userId.toString() && !p.leftAt
  );
  
  if (participant) {
    participant.leftAt = new Date();
    this.participantCount = this.participants.filter(p => !p.leftAt).length;
  }
  
  return this.save();
};

// 🆕 METHOD TO GET JOIN LINKS
meetingSchema.methods.getJoinLinks = function() {
  return {
    primary: this.meetLink,
    direct: this.directJoinLink || `https://meet.google.com/${this.meetingCode}`,
    instant: this.instantJoinLink || `https://meet.google.com/${this.meetingCode}?authuser=0`,
    fallback: this.meetLink
  };
};

// 🆕 STATIC METHOD TO FIND ACTIVE MEETING WITH ENHANCED DATA
meetingSchema.statics.findActiveWithResources = async function() {
  return this.findOne({ 
    status: 'active',
    scheduledEnd: { $gt: new Date() }
  })
  .sort({ createdAt: -1 })
  .populate('participants.userId', 'name email')
  .populate('expectedParticipants', 'name email');
};

// 🆕 STATIC METHOD TO GET MEETING STATS
meetingSchema.statics.getMeetingStats = async function(meetingId) {
  const meeting = await this.findOne({ meetingId })
    .populate('participants.userId', 'name email')
    .populate('expectedParticipants', 'name email');
  
  if (!meeting) {
    return null;
  }
  
  const stats = {
    totalParticipants: meeting.participants.length,
    activeParticipants: meeting.participants.filter(p => !p.leftAt).length,
    joinMethods: {
      seamless: meeting.participants.filter(p => p.joinMethod === 'seamless').length,
      direct: meeting.participants.filter(p => p.joinMethod === 'direct').length,
      manual: meeting.participants.filter(p => p.joinMethod === 'manual').length
    },
    averageSessionTime: 0, // You can calculate this based on join/leave times
    resourcesShared: 0 // You can populate this from Resources model
  };
  
  return stats;
};

module.exports = mongoose.model('Meeting', meetingSchema);