// travel-tour-backend/meet-module/models/Meeting.js
const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema({
  meetingId: {
    type: String,
    required: true,
    unique: true
  },
  meetLink: {
    type: String,
    required: true
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
  }
});

// Index for faster queries
meetingSchema.index({ meetingId: 1 });
meetingSchema.index({ status: 1, scheduledEnd: 1 });
meetingSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Meeting', meetingSchema);