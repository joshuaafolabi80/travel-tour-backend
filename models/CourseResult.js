const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
  questionId: {
    type: String,
    required: true
  },
  questionText: {
    type: String,
    required: true
  },
  selectedOption: {
    type: Number,
    required: true
  },
  selectedAnswer: {
    type: String,
    required: true
  },
  correctAnswer: {
    type: Number,
    required: true
  },
  correctAnswerText: {
    type: String,
    required: true
  },
  isCorrect: {
    type: Boolean,
    required: true
  },
  explanation: {
    type: String,
    default: ''
  },
  options: {
    type: [String],
    default: []
  },
  points: {
    type: Number,
    default: 0
  }
});

const courseResultSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  userName: {
    type: String,
    required: true
  },
  courseId: {
    type: String,
    required: true
  },
  courseName: {
    type: String,
    required: true
  },
  courseType: {
    type: String,
    enum: ['general', 'masterclass'],
    default: 'general'
  },
  score: {
    type: Number,
    required: true
  },
  maxScore: {
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
    type: Number, // in seconds
    required: true
  },
  remark: {
    type: String,
    required: true
  },
  answers: [answerSchema],
  status: {
    type: String,
    default: 'completed'
  },
  questionSetId: {
    type: String,
    required: true
  },
  questionSetTitle: {
    type: String,
    required: true
  },
  questionSetType: {
    type: String,
    default: 'general'
  },
  scoringSystem: {
    type: String,
    default: '5_points_per_question'
  },
  readByAdmin: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Add index for better query performance
courseResultSchema.index({ userId: 1, createdAt: -1 });
courseResultSchema.index({ courseType: 1, createdAt: -1 });
courseResultSchema.index({ readByAdmin: 1 });

module.exports = mongoose.model('CourseResult', courseResultSchema);