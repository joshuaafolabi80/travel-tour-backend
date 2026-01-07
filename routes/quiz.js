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

// Helper function for remarks
function getRemark(percentage) {
  if (percentage >= 80) return 'Excellent';
  if (percentage >= 60) return 'Good';
  if (percentage >= 40) return 'Fair';
  return 'Needs Improvement';
}

// 🚨 FIXED: Get quiz questions using destinationId matching
router.get('/questions', authMiddleware, async (req, res) => {
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
    const formattedQuestions = questions.map(q => {
      const correctIndex = q.options.findIndex(option => option === q.correctAnswer);
      
      return {
        id: q._id,
        question: q.question,
        options: q.options || [],
        correctAnswer: correctIndex, // Send as index, not the actual answer text
        explanation: q.explanation
      };
    });

    res.json({
      success: true,
      questions: formattedQuestions,
      totalQuestions: formattedQuestions.length,
      destinationId: destinationId,
      courseName: course.name,
      courseId: course._id
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

// 🚨 COMPLETELY FIXED: Submit quiz results - MATCHES QuizResult MODEL SCHEMA
router.post('/results', authMiddleware, async (req, res) => {
  try {
    const { 
      answers, 
      userId, 
      userName, 
      courseId, 
      courseName, 
      destination,
      timeTaken = 0 
    } = req.body;
    
    console.log('📝 Submitting quiz results:', { 
      userId, 
      userName, 
      courseId, 
      courseName,
      destination,
      answersCount: answers?.length || 0,
      timeTaken
    });
    
    // Validation
    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Answers array is required and must not be empty' 
      });
    }
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'userId is required' 
      });
    }
    
    if (!courseId) {
      return res.status(400).json({ 
        success: false, 
        message: 'courseId is required' 
      });
    }

    const db = mongoose.connection.db;
    let score = 0;
    const questionResults = [];

    // Process each answer
    for (const answer of answers) {
      try {
        if (!answer.questionId) {
          console.warn('⚠️ Answer missing questionId:', answer);
          continue;
        }

        const question = await db.collection('quiz_questions').findOne({ 
          _id: new mongoose.Types.ObjectId(answer.questionId) 
        });
        
        if (question) {
          // Find correct answer index
          const correctIndex = question.options.findIndex(option => option === question.correctAnswer);
          const selectedOption = answer.selectedAnswer !== undefined ? answer.selectedAnswer : answer.selectedOption;
          
          if (selectedOption === undefined) {
            console.warn('⚠️ Answer missing selected option:', answer);
            continue;
          }
          
          const isCorrect = correctIndex === selectedOption;
          
          if (isCorrect) {
            score++;
          }
          
          // 🚨 CRITICAL: Create answer object matching QuizResult schema
          const processedAnswer = {
            questionId: answer.questionId,
            question: question.question, // Must match schema field name "question"
            selectedOption: selectedOption, // Must match schema field name "selectedOption"
            correctAnswer: correctIndex,
            correctAnswerText: question.correctAnswer,
            isCorrect: isCorrect,
            options: question.options || [],
            explanation: question.explanation || ''
          };
          
          questionResults.push(processedAnswer);
          
          console.log(`✓ Processed question ${answer.questionId}: selected=${selectedOption}, correct=${correctIndex}, isCorrect=${isCorrect}`);
        } else {
          console.warn(`⚠️ Question not found for ID: ${answer.questionId}`);
        }
      } catch (err) {
        console.error(`❌ Error processing answer ${answer.questionId}:`, err.message);
      }
    }

    // Calculate results
    const totalQuestions = answers.length;
    const percentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;
    const remark = getRemark(percentage);

    console.log(`📊 Quiz results calculated: ${score}/${totalQuestions} (${percentage}%) - ${remark}`);

    // Prepare quiz result data
    const quizResultData = {
      userId: userId,
      userName: userName || req.user?.name || req.user?.email?.split('@')[0] || 'Unknown User',
      courseId: courseId,
      courseName: courseName || destination || 'Unknown Course',
      destination: destination || '',
      score: score,
      totalQuestions: totalQuestions,
      percentage: percentage,
      remark: remark, // 🚨 REQUIRED by schema
      timeTaken: timeTaken,
      status: 'completed',
      answers: questionResults,
      submittedAt: new Date(),
      readByAdmin: false
    };

    console.log('💾 Saving quiz result with data:', {
      userId: quizResultData.userId,
      courseName: quizResultData.courseName,
      score: quizResultData.score,
      totalQuestions: quizResultData.totalQuestions,
      percentage: quizResultData.percentage,
      remark: quizResultData.remark,
      answersCount: quizResultData.answers.length
    });

    // Validate the data matches schema
    try {
      // Create and validate quiz result
      const quizResult = new QuizResult(quizResultData);
      
      // Manually validate before save
      await quizResult.validate();
      
      // Save to database
      await quizResult.save();

      console.log(`✅ Quiz result saved successfully: ${quizResult._id}`);

      res.json({
        success: true,
        score: score,
        totalQuestions: totalQuestions,
        percentage: percentage,
        remark: remark,
        resultId: quizResult._id,
        answers: questionResults,
        message: 'Quiz submitted successfully!'
      });

    } catch (validationError) {
      console.error('❌ QuizResult validation failed:', validationError);
      console.error('❌ Validation errors:', validationError.errors);
      
      // Send detailed validation errors
      const errorDetails = {};
      if (validationError.errors) {
        Object.keys(validationError.errors).forEach(key => {
          errorDetails[key] = validationError.errors[key].message;
        });
      }
      
      res.status(400).json({ 
        success: false, 
        message: 'Quiz submission validation failed',
        error: validationError.message,
        details: errorDetails,
        submittedData: {
          remark: quizResultData.remark,
          answersSample: quizResultData.answers.slice(0, 2).map(a => ({
            hasQuestion: !!a.question,
            hasSelectedOption: a.selectedOption !== undefined,
            questionLength: a.question?.length || 0
          }))
        }
      });
    }

  } catch (error) {
    console.error('❌ Error submitting quiz results:', error);
    console.error('❌ Error stack:', error.stack);
    
    res.status(500).json({ 
      success: false, 
      message: 'Error submitting quiz results',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// 🚨 FIXED: Get quiz results for a user
router.get('/user-results', authMiddleware, async (req, res) => {
  try {
    console.log('📊 Fetching quiz results for user:', req.user._id);
    
    const results = await QuizResult.find({ userId: req.user._id })
      .sort({ submittedAt: -1 });

    console.log(`✅ Found ${results.length} quiz results for user ${req.user._id}`);

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

// 🚨 FIXED: Get specific quiz result by ID
router.get('/results/:id', authMiddleware, async (req, res) => {
  try {
    const resultId = req.params.id;
    
    const result = await QuizResult.findById(resultId);
    
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Quiz result not found'
      });
    }

    // Check if user has permission to view this result
    if (req.user.role !== 'admin' && result.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this result'
      });
    }

    console.log(`✅ Found quiz result: ${resultId}`);

    res.json({
      success: true,
      result: result
    });

  } catch (error) {
    console.error('❌ Error fetching quiz result:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching quiz result',
      error: error.message 
    });
  }
});

// 🚨 FIXED: Get all quiz results (admin only)
router.get('/admin-results', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied: Admin only' 
      });
    }

    console.log('📊 Admin fetching all quiz results');
    
    const results = await QuizResult.find()
      .sort({ submittedAt: -1 })
      .populate('userId', 'username email name');

    console.log(`✅ Admin found ${results.length} quiz results total`);

    res.json({
      success: true,
      results: results,
      total: results.length
    });

  } catch (error) {
    console.error('❌ Error fetching admin quiz results:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching admin quiz results',
      error: error.message 
    });
  }
});

// 🚨 FIXED: Mark quiz results as read by admin
router.put('/results/mark-read', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied' 
      });
    }

    const { resultIds } = req.body;
    let result;
    
    if (resultIds && Array.isArray(resultIds) && resultIds.length > 0) {
      result = await QuizResult.updateMany(
        { _id: { $in: resultIds } },
        { 
          $set: { 
            readByAdmin: true, 
            readAt: new Date() 
          } 
        }
      );
    } else {
      result = await QuizResult.updateMany(
        { readByAdmin: false },
        { 
          $set: { 
            readByAdmin: true, 
            readAt: new Date() 
          } 
        }
      );
    }

    console.log(`✅ Marked ${result.modifiedCount} quiz results as read`);

    res.json({
      success: true,
      message: `Marked ${result.modifiedCount} quiz results as read`,
      modifiedCount: result.modifiedCount
    });

  } catch (error) {
    console.error('❌ Error marking quiz results as read:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error marking quiz results as read',
      error: error.message 
    });
  }
});

// 🚨 DEBUG: Test quiz submission with sample data
router.post('/test-submit', authMiddleware, async (req, res) => {
  try {
    console.log('🧪 Testing quiz submission with sample data');
    
    // Sample test data that matches the schema
    const testData = {
      userId: req.user._id,
      userName: req.user.name || 'Test User',
      courseId: 'test-course-id',
      courseName: 'Test Course',
      destination: 'Test Destination',
      timeTaken: 300,
      answers: [
        {
          questionId: new mongoose.Types.ObjectId(),
          selectedAnswer: 0,
          questionText: 'Sample question 1'
        },
        {
          questionId: new mongoose.Types.ObjectId(),
          selectedAnswer: 2,
          questionText: 'Sample question 2'
        }
      ]
    };
    
    // Call the actual submission route with test data
    req.body = testData;
    
    // Create a mock response object
    const mockRes = {
      json: (data) => {
        console.log('✅ Test submission result:', data);
        res.json({
          success: true,
          message: 'Test completed',
          testResult: data
        });
      },
      status: (code) => {
        console.log(`Test status: ${code}`);
        return mockRes;
      }
    };
    
    // Call the actual results route
    await router.stack.find(r => r.route.path === '/results' && r.route.methods.post).handle(req, mockRes);
    
  } catch (error) {
    console.error('❌ Test submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Test failed',
      error: error.message
    });
  }
});

// 🚨 DEBUG: Get QuizResult schema info
router.get('/schema-info', authMiddleware, async (req, res) => {
  try {
    const schema = QuizResult.schema;
    
    // Extract required fields
    const requiredFields = [];
    const answerSchema = schema.path('answers');
    
    Object.keys(schema.paths).forEach(pathName => {
      const path = schema.paths[pathName];
      if (path.isRequired) {
        requiredFields.push(pathName);
      }
    });
    
    res.json({
      success: true,
      schemaInfo: {
        modelName: 'QuizResult',
        requiredFields: requiredFields,
        answersSchema: {
          type: answerSchema?.instance,
          required: answerSchema?.isRequired,
          nestedFields: answerSchema?.schema ? Object.keys(answerSchema.schema.paths) : []
        },
        sampleDocument: {
          userId: 'ObjectId',
          userName: 'String (required)',
          courseId: 'String (required)',
          courseName: 'String (required)',
          score: 'Number (required)',
          totalQuestions: 'Number (required)',
          percentage: 'Number (required)',
          remark: 'String (required)',
          timeTaken: 'Number',
          status: 'String',
          answers: [{
            questionId: 'ObjectId',
            question: 'String (required)',
            selectedOption: 'Number (required)',
            correctAnswer: 'Number (required)',
            correctAnswerText: 'String',
            isCorrect: 'Boolean (required)',
            options: ['String'],
            explanation: 'String'
          }],
          submittedAt: 'Date',
          readByAdmin: 'Boolean'
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting schema info:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting schema info',
      error: error.message
    });
  }
});

module.exports = router;