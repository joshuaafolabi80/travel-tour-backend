// models/QuizResult.js - COMPLETE INTEGRATED VERSION
const mongoose = require('mongoose');

const quizResultSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userName: {
    type: String,
    required: true
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: false
  },
  courseName: {
    type: String,
    required: false
  },
  destination: {
    type: String,
    required: false
  },
  score: {
    type: Number,
    required: true
  },
  totalQuestions: {
    type: Number,
    required: true
  },
  percentage: {
    type: Number,
    required: true
  },
  timeTaken: {
    type: Number,
    default: 0
  },
  remark: {
    type: String,
    required: true
  },
  answers: [{
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    question: {
      type: String,
      required: true
    },
    questionText: {
      type: String,
      required: false
    },
    selectedOption: {
      type: String,
      required: true
    },
    selectedAnswer: {
      type: mongoose.Schema.Types.Mixed,
      required: false
    },
    correctAnswer: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    correctAnswerText: {
      type: String,
      required: false
    },
    isCorrect: {
      type: Boolean,
      required: true
    },
    options: [{
      type: String
    }],
    explanation: {
      type: String,
      required: false
    }
  }],
  status: {
    type: String,
    enum: ['in_progress', 'completed', 'abandoned'],
    default: 'completed'
  },
  date: {
    type: Date,
    default: Date.now
  },
  submittedAt: {
    type: Date,
    default: Date.now
  },
  readByAdmin: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date,
    required: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'quiz_results' // 🚨 CRITICAL - MUST BE THIS
});

// Middleware to update updatedAt before saving
quizResultSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const QuizResult = mongoose.model('QuizResult', quizResultSchema);
module.exports = QuizResult;