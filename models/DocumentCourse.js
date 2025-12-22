// travel-tour-backend/models/DocumentCourse.js
const mongoose = require('mongoose');

const documentCourseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  courseType: {
    type: String,
    enum: ['general', 'masterclass'],
    required: true
  },
  fileName: {
    type: String,
    required: true
  },
  storedFileName: {
    type: String,
    required: false
  },
  fileSize: {
    type: Number,
    required: true
  },
  fileType: {
    type: String,
    required: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  accessCode: {
    type: String,
    sparse: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  views: {
    type: Number,
    default: 0
  },
  filePath: {
    type: String,
    required: false
  },
  // New field for storing image references
  images: [{
    filename: String,
    originalName: String,
    path: String,
    mimeType: String,
    size: Number,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Field to store HTML content with embedded images
  htmlContent: {
    type: String,
    required: false
  }
}, {
  timestamps: true
});

documentCourseSchema.index({ courseType: 1, uploadedAt: -1 });
documentCourseSchema.index({ isActive: 1 });

const DocumentCourse = mongoose.model('DocumentCourse', documentCourseSchema);

module.exports = DocumentCourse;