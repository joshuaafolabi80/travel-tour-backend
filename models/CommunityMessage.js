// server/models/CommunityMessage.js
const mongoose = require('mongoose');

const communityMessageSchema = new mongoose.Schema({
  sender: {
    type: String,
    required: true
  },
  senderId: {
    type: String,
    required: true
  },
  text: {
    type: String,
    required: true,
    maxlength: 1000
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  callId: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Index for efficient querying
communityMessageSchema.index({ timestamp: -1 });
communityMessageSchema.index({ callId: 1 });

module.exports = mongoose.model('CommunityMessage', communityMessageSchema);