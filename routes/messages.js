// routes/messages.js - COMPLETE UPDATED VERSION WITH PHONE SUPPORT
const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const User = require('../models/User'); 
const { authMiddleware } = require('./auth');

// SECURED - Get messages FROM admin for the current user
router.get('/from-admin', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    console.log(`🔒 FETCHING messages FROM admin for User ID: ${userId}`);

    // Fetch messages where the current user is the recipient (toStudent)
    const messages = await Message.find({
      toStudent: userId
    })
    .populate('fromAdmin', 'username email profile')
    .sort({ createdAt: -1 })
    .lean();

    console.log(`✅ Returning ${messages.length} messages FROM admin for user ${userId}`);

    res.json({
      success: true,
      messages: messages,
      note: 'Messages sent from admin to you'
    });

  } catch (error) {
    console.error('Error in /from-admin:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching messages from admin.',
      error: error.message
    });
  }
});

// SECURED - Get messages sent BY the current user
router.get('/sent', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    console.log(`🔒 FETCHING messages SENT by User ID: ${userId}`);

    const messages = await Message.find({
      fromStudent: userId
    })
    .populate('toAdmin', 'username email profile')
    .sort({ createdAt: -1 })
    .lean();

    console.log(`✅ Returning ${messages.length} messages SENT by user ${userId}`);

    res.json({
      success: true,
      messages: messages
    });

  } catch (error) {
    console.error('Error in /sent:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching sent messages.',
      error: error.message
    });
  }
});

// SECURED - Send message to admin (UPDATED WITH PHONE SUPPORT)
router.post('/send-to-admin', authMiddleware, async (req, res) => {
  try {
    const { subject, message, phone } = req.body; // ADDED: phone
    const fromUserId = req.user._id;

    console.log(`🔒 SENDING message to admin from User ID: ${fromUserId}`);

    if (!subject || !message) {
      return res.status(400).json({ success: false, message: 'Subject and message are required' });
    }

    const adminUser = await User.findOne({ role: 'admin', active: true });
    if (!adminUser) {
      return res.status(200).json({
        success: true,
        message: 'Message received, but no active admin was found to receive it.'
      });
    }

    const newMessage = new Message({
      fromStudent: fromUserId,
      toAdmin: adminUser._id,
      subject: subject.trim(),
      message: message.trim(),
      phone: phone || '', // ADDED: Store phone number
      messageType: 'student_to_admin'
    });

    await newMessage.save();

    console.log('✅ Message saved with ID:', newMessage._id);

    res.status(201).json({
      success: true,
      message: 'Message sent successfully to administrator.',
      data: newMessage
    });

  } catch (error) {
    console.error('Error in /send-to-admin:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while sending message.',
      error: error.message
    });
  }
});

// SECURED - Mark message as read
router.put('/:messageId/mark-read', authMiddleware, async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    console.log(`🔒 MARKING message as read: ${messageId} for user: ${userId}`);

    const message = await Message.findOneAndUpdate(
      { 
        _id: messageId, 
        toStudent: userId 
      },
      { 
        read: true,
        readAt: new Date()
      },
      { new: true }
    );

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found or you do not have permission to mark it as read.'
      });
    }

    // Update user's unread message count
    await User.findByIdAndUpdate(userId, {
      $inc: { unreadMessages: -1 }
    });

    res.json({
      success: true,
      message: 'Message marked as read',
      data: message
    });

  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while marking message as read.',
      error: error.message
    });
  }
});

// SECURED - Mark all admin messages as read
router.put('/mark-all-read', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;

    console.log(`🔒 MARKING ALL messages as read for user: ${userId}`);

    const result = await Message.updateMany(
      { 
        toStudent: userId,
        read: false 
      },
      { 
        read: true,
        readAt: new Date()
      }
    );

    // Reset unread message count
    await User.findByIdAndUpdate(userId, {
      unreadMessages: 0
    });

    res.json({
      success: true,
      message: `Marked ${result.modifiedCount} messages as read`,
      modifiedCount: result.modifiedCount
    });

  } catch (error) {
    console.error('Error marking all messages as read:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while marking messages as read.',
      error: error.message
    });
  }
});

// OPEN - Test route
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Messages route is working!',
    timestamp: new Date().toISOString()
  });
});

// OPEN - Debug route to check all messages (for testing)
router.get('/debug-all', async (req, res) => {
  try {
    const messages = await Message.find()
      .populate('fromStudent', 'username email')
      .populate('toAdmin', 'username email')
      .populate('fromAdmin', 'username email')
      .populate('toStudent', 'username email')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      totalCount: messages.length,
      messages: messages,
      note: 'DEBUG - All messages in system'
    });
  } catch (error) {
    console.error('Error in debug-all:', error);
    res.status(500).json({
      success: false,
      message: 'Debug error',
      error: error.message
    });
  }
});

module.exports = router;