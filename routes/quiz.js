// travel-tour-backend/routes/quiz.js

const express = require('express');
const mongoose = require('mongoose');
const QuizResult = require('../models/QuizResult');
const Course = require('../models/Course');
const User = require('../models/User');

const router = express.Router();

// Simple auth middleware
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// 🚨 FIXED: Get quiz questions using destinationId matching
router.get('/quiz/questions', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.query;
    
    if (!courseId) {
      return res.status(400).json({ 
        success: false, 
        message: 'courseId parameter is required' 
      });
    }
    
    console.log(`🔍 Fetching quiz questions for course: ${courseId}`);
    
    // 1. Find the course to get its destinationId
    let course;
    try {
      course = await Course.findById(courseId);
    } catch (error) {
      console.log('⚠️ Could not find course with ObjectId, trying string match');
      // Try finding by destinationId if courseId is actually a destinationId string
      course = await Course.findOne({ destinationId: courseId });
    }
    
    if (!course) {
      return res.status(404).json({ 
        success: false, 
        message: 'Course not found' 
      });
    }
    
    const destinationId = course.destinationId;
    console.log(`📚 Found course: "${course.name}", destinationId: "${destinationId}"`);
    
    // 2. Get questions using destinationId
    const db = mongoose.connection.db;
    const questions = await db.collection('quiz_questions')
      .find({ destinationId: destinationId })
      .toArray();
    
    if (questions.length === 0) {
      console.log(`❌ No questions found for destinationId: "${destinationId}"`);
      return res.status(404).json({ 
        success: false, 
        message: 'No questions found for this destination' 
      });
    }
    
    console.log(`✅ Found ${questions.length} questions for "${destinationId}"`);

    // Format questions (exclude correct answers for security)
    const formattedQuestions = questions.map(q => ({
      id: q._id,
      question: q.question,
      options: q.options || [],
      explanation: q.explanation
    }));

    res.json({
      success: true,
      questions: formattedQuestions,
      totalQuestions: formattedQuestions.length,
      destinationId: destinationId,
      courseName: course.name
    });

  } catch (error) {
    console.error('❌ Error fetching quiz questions:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching quiz questions',
      error: error.message 
    });
  }
});

// 🚨 FIXED: Submit quiz results
router.post('/quiz/results', authMiddleware, async (req, res) => {
  try {
    const { answers, userId, userName, courseId, courseName } = req.body;
    
    console.log('📝 Submitting quiz results');
    
    if (!answers || !userId || !courseId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }

    // Calculate score
    let score = 0;
    const questionResults = [];
    const db = mongoose.connection.db;

    for (const answer of answers) {
      const question = await db.collection('quiz_questions').findOne({ 
        _id: new mongoose.Types.ObjectId(answer.questionId) 
      });
      
      if (question) {
        const isCorrect = question.correctAnswer === answer.selectedAnswer;
        if (isCorrect) score++;
        
        questionResults.push({
          questionId: answer.questionId,
          questionText: question.question,
          selectedAnswer: answer.selectedAnswer,
          correctAnswer: question.correctAnswer,
          isCorrect: isCorrect,
          options: question.options || []
        });
      }
    }

    const totalQuestions = answers.length;
    const percentage = Math.round((score / totalQuestions) * 100);

    // Save result
    const quizResult = new QuizResult({
      userId: userId,
      userName: userName || req.user.name || req.user.email.split('@')[0],
      courseId: courseId,
      courseName: courseName,
      score: score,
      totalQuestions: totalQuestions,
      percentage: percentage,
      answers: questionResults,
      timeTaken: req.body.timeTaken || 0,
      status: 'completed'
    });

    await quizResult.save();

    console.log(`✅ Quiz result saved: ${score}/${totalQuestions} (${percentage}%)`);

    res.json({
      success: true,
      score: score,
      totalQuestions: totalQuestions,
      percentage: percentage,
      resultId: quizResult._id,
      remark: getRemark(percentage)
    });

  } catch (error) {
    console.error('❌ Error submitting quiz results:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error submitting quiz results',
      error: error.message 
    });
  }
});

// 🚨 FIXED: Get quiz results
router.get('/quiz/results', authMiddleware, async (req, res) => {
  try {
    console.log('📊 Fetching quiz results');
    
    let query = {};
    
    if (req.user.role === 'student') {
      query.userId = req.user._id;
    }
    
    const results = await QuizResult.find(query)
      .sort({ createdAt: -1 });

    console.log(`✅ Found ${results.length} quiz results`);

    res.json({
      success: true,
      results: results,
      total: results.length
    });

  } catch (error) {
    console.error('❌ Error fetching quiz results:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching quiz results',
      error: error.message 
    });
  }
});

// 🚨 FIXED: Mark as read by admin
router.put('/quiz/results/mark-read-admin', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied' 
      });
    }

    const result = await QuizResult.updateMany(
      { readByAdmin: false },
      { readByAdmin: true }
    );

    console.log(`✅ Marked ${result.modifiedCount} results as read`);

    res.json({
      success: true,
      message: `Marked ${result.modifiedCount} results as read`,
      modifiedCount: result.modifiedCount
    });

  } catch (error) {
    console.error('Error marking results as read:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error marking results as read' 
    });
  }
});

// Helper function
function getRemark(percentage) {
  if (percentage >= 80) return 'Excellent';
  if (percentage >= 60) return 'Good';
  if (percentage >= 40) return 'Fair';
  return 'Needs Improvement';
}

module.exports = router;