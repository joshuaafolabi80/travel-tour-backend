// server/models/Course.js - UPDATED VERSION
const mongoose = require('mongoose');

const faqSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true,
  },
  answer: {
    type: String,
    required: true,
  },
});

const sectionSchema = new mongoose.Schema({
  heading: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  images: [String],
  videos: [String],
});

const courseSchema = new mongoose.Schema({
  destinationId: {
    type: String,
    required: true,
    unique: true,
  },
  name: {
    type: String,
    required: true,
  },
  continent: {
    type: String,
    required: true,
  },
  heroImage: {
    type: String,
    required: true,
  },
  about: {
    type: String,
    required: true,
  },
  enrollmentCount: {
    type: Number,
    default: 0,
  },
  faqs: [faqSchema],
  
  // NEW FIELDS FOR GENERAL/MASTERCLASS SYSTEM
  courseType: {
    type: String,
    enum: ['general', 'masterclass'],
    default: 'general'
  },
  accessCode: {
    type: String,
    sparse: true // Only for masterclass courses
  },
  isActive: {
    type: Boolean,
    default: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  views: {
    type: Number,
    default: 0
  },
  // END NEW FIELDS

  fullCourseDetails: {
    itinerary: [{
      day: Number,
      title: String,
      description: String
    }],
    sections: [sectionSchema],
  }
}, {
  timestamps: true
});

// Add indexes for new fields
courseSchema.index({ courseType: 1, uploadedAt: -1 });
courseSchema.index({ isActive: 1 });

const Course = mongoose.model('Course', courseSchema);

module.exports = Course;