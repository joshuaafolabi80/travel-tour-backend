// travel-tour-backend/meet-module/models/Resource.js
const mongoose = require('mongoose');

const resourceSchema = new mongoose.Schema({
  resourceId: {
    type: String,
    required: true,
    unique: true
  },
  meetingId: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['link', 'document', 'text', 'image', 'video', 'pdf', 'file'],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  fileName: {
    type: String
  },
  fileSize: {
    type: Number
  },
  fileType: {
    type: String
  },
  mimeType: {
    type: String
  },
  thumbnail: {
    type: String
  },
  uploadedFrom: {
    type: String,
    enum: ['mobile', 'web'],
    default: 'web'
  },
  originalPath: {
    type: String
  },
  sharedBy: {
    type: String, // 🆕 CHANGED FROM ObjectId TO String FOR FLEXIBILITY
    default: 'unknown'
  },
  sharedByName: {
    type: String,
    default: 'Unknown User'
  },
  sharedAt: {
    type: Date,
    default: Date.now
  },
  accessedBy: [{
    userId: {
      type: String, // 🆕 CHANGED FROM ObjectId TO String
      default: 'unknown'
    },
    accessedAt: {
      type: Date,
      default: Date.now
    },
    device: {
      type: String,
      default: 'web'
    },
    action: {
      type: String,
      enum: ['view', 'download'],
      default: 'view'
    }
  }],
  accessCount: {
    type: Number,
    default: 0
  },
  downloadCount: {
    type: Number,
    default: 0
  },
  tags: [{
    type: String
  }],
  priority: {
    type: String,
    enum: ['high', 'medium', 'low'],
    default: 'medium'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  uploadStatus: {
    type: String,
    enum: ['uploading', 'completed', 'error'],
    default: 'completed'
  },
  
  // 🆕 COMPATIBILITY FIELDS FOR FRONTEND-BACKEND ALIGNMENT
  id: { 
    type: String, 
    default: function() { return this.resourceId; } 
  },
  fileUrl: {
    type: String
  },
  uploadedBy: { 
    type: String, 
    default: function() { return this.sharedBy; } 
  },
  uploadedByName: { 
    type: String, 
    default: function() { return this.sharedByName; } 
  },
  resourceType: { 
    type: String, 
    default: function() { return this.type; } 
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  // 🛡️ PROTECTION FIELDS
  deactivatedAt: Date,
  deletedByAdmin: String,
  deletionMethod: String,
  guardianReactivatedAt: Date,
  recoveredAt: Date,
  recoveredByAdmin: String
}, { 
  timestamps: true,
  collection: 'resources'
});

// Indexes for faster queries
resourceSchema.index({ meetingId: 1 });
resourceSchema.index({ resourceId: 1 });
resourceSchema.index({ sharedBy: 1 });
resourceSchema.index({ sharedAt: -1 });
resourceSchema.index({ isActive: 1 }); // 🆕 ADDED FOR BETTER QUERIES

module.exports = mongoose.model('Resource', resourceSchema);