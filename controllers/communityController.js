// server/controllers/communityController.js
const CommunityMessage = require('../models/CommunityMessage');

const communityController = {
  // Get message history for community
  getMessageHistory: async (req, res) => {
    try {
      const messages = await CommunityMessage.find()
        .sort({ timestamp: -1 })
        .limit(100)
        .exec();
      
      res.json({
        success: true,
        messages: messages.reverse(), // Return in chronological order
        total: messages.length
      });
    } catch (error) {
      console.error('Error fetching message history:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching message history'
      });
    }
  },

  // Save a community message
  saveMessage: async (req, res) => {
    try {
      const { sender, senderId, text, isAdmin } = req.body;
      
      const message = new CommunityMessage({
        sender,
        senderId,
        text,
        isAdmin,
        timestamp: new Date()
      });
      
      await message.save();
      
      res.json({
        success: true,
        message: 'Message saved successfully',
        messageId: message._id
      });
    } catch (error) {
      console.error('Error saving message:', error);
      res.status(500).json({
        success: false,
        message: 'Error saving message'
      });
    }
  },

  // Get active call information
  getActiveCall: async (req, res) => {
    try {
      // This would typically check a database for active calls
      // For now, we'll return a simple response
      res.json({
        success: true,
        activeCall: null, // Would be call object if active
        message: 'No active calls'
      });
    } catch (error) {
      console.error('Error checking active call:', error);
      res.status(500).json({
        success: false,
        message: 'Error checking active call'
      });
    }
  },

  // Clear community messages (admin only)
  clearMessages: async (req, res) => {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Only admins can clear messages'
        });
      }
      
      await CommunityMessage.deleteMany({});
      
      res.json({
        success: true,
        message: 'All community messages cleared'
      });
    } catch (error) {
      console.error('Error clearing messages:', error);
      res.status(500).json({
        success: false,
        message: 'Error clearing messages'
      });
    }
  }
};

module.exports = communityController;