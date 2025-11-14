// travel-tour-backend/meet-module/routes/meetings.js
const express = require('express');
const router = express.Router();
const Meeting = require('../models/Meeting');
const Resource = require('../models/Resource');
const { scheduleMeetingWarning } = require('../services/meetingScheduler');

// Generate random meeting code for Google Meet
const generateMeetCode = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 3; i++) {
    if (i > 0) result += '-';
    for (let j = 0; j < 3; j++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }
  return result;
};

// ✅ CREATE NEW MEETING
router.post('/create', async (req, res) => {
  try {
    const { adminId, title, description } = req.body;
    
    if (!adminId || !title) {
      return res.status(400).json({
        success: false,
        message: 'Admin ID and title are required'
      });
    }

    // Generate meeting data
    const meetingData = {
      meetingId: `mtg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      meetLink: `https://meet.google.com/${generateMeetCode()}`,
      title: title,
      description: description || 'Join our community discussion',
      createdBy: adminId,
      adminName: 'The Conclave Academy', // You can fetch actual admin name from your user DB
      scheduledStart: new Date(),
      scheduledEnd: new Date(Date.now() + 50 * 60 * 1000), // 50 minutes
      status: 'active',
      extensions: 0,
      maxExtensions: 2,
      autoEndScheduled: true,
      warningSent: false
    };
    
    // Save to database
    const meeting = await Meeting.create(meetingData);
    
    // Schedule the 10-minute warning
    await scheduleMeetingWarning(meeting);
    
    console.log(`✅ Meeting created: ${meeting.title} (${meeting.meetingId})`);
    
    res.json({
      success: true,
      meeting: meeting,
      message: 'Meeting created successfully'
    });
    
  } catch (error) {
    console.error('Create meeting error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ EXTEND MEETING (Admin only)
router.post('/:meetingId/extend', async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { adminId } = req.body;
    
    if (!adminId) {
      return res.status(400).json({
        success: false,
        message: 'Admin ID is required'
      });
    }
    
    // Find original meeting
    const originalMeeting = await Meeting.findOne({ meetingId });
    
    if (!originalMeeting) {
      return res.status(404).json({ success: false, error: 'Meeting not found' });
    }
    
    // Check extension limit
    if (originalMeeting.extensions >= originalMeeting.maxExtensions) {
      return res.status(400).json({ 
        success: false, 
        error: 'Maximum extensions reached' 
      });
    }
    
    // Create extended meeting
    const extendedMeetingData = {
      meetingId: `mtg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      meetLink: `https://meet.google.com/${generateMeetCode()}`,
      title: `${originalMeeting.title} (Extended)`,
      description: originalMeeting.description,
      createdBy: adminId,
      adminName: originalMeeting.adminName,
      originalMeetingId: originalMeeting.meetingId,
      scheduledStart: originalMeeting.scheduledEnd, // Continue from previous end
      scheduledEnd: new Date(originalMeeting.scheduledEnd.getTime() + 50 * 60 * 1000),
      status: 'active',
      extensions: originalMeeting.extensions + 1,
      maxExtensions: originalMeeting.maxExtensions,
      autoEndScheduled: true,
      warningSent: false
    };
    
    const extendedMeeting = await Meeting.create(extendedMeetingData);
    
    // Update original meeting
    await Meeting.updateOne(
      { meetingId },
      { 
        status: 'extended',
        actualEnd: new Date(),
        lastExtensionAt: new Date()
      }
    );
    
    // Schedule warning for extended meeting
    await scheduleMeetingWarning(extendedMeeting);
    
    console.log(`✅ Meeting extended: ${originalMeeting.title} -> ${extendedMeeting.title}`);
    
    res.json({
      success: true,
      meeting: extendedMeeting,
      message: 'Meeting extended successfully'
    });
    
  } catch (error) {
    console.error('Extend meeting error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ GET ACTIVE MEETING
router.get('/active', async (req, res) => {
  try {
    const activeMeeting = await Meeting.findOne({ 
      status: 'active',
      scheduledEnd: { $gt: new Date() } // Not expired
    }).sort({ createdAt: -1 });
    
    if (activeMeeting) {
      // Get resources for this meeting
      const resources = await Resource.find({ 
        meetingId: activeMeeting.meetingId,
        isActive: true 
      }).sort({ sharedAt: -1 });
      
      res.json({
        active: true,
        meeting: activeMeeting,
        resources: resources
      });
    } else {
      res.json({ active: false });
    }
    
  } catch (error) {
    console.error('Get active meeting error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ END MEETING MANUALLY
router.post('/:meetingId/end', async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { adminId } = req.body;
    
    if (!adminId) {
      return res.status(400).json({
        success: false,
        message: 'Admin ID is required'
      });
    }
    
    const meeting = await Meeting.findOne({ meetingId });
    
    if (!meeting) {
      return res.status(404).json({ success: false, error: 'Meeting not found' });
    }
    
    await Meeting.updateOne(
      { meetingId },
      { 
        status: 'ended',
        actualEnd: new Date()
      }
    );
    
    console.log(`✅ Meeting ended manually: ${meeting.title}`);
    
    res.json({ success: true, message: 'Meeting ended successfully' });
    
  } catch (error) {
    console.error('End meeting error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ GET MEETING BY ID
router.get('/:meetingId', async (req, res) => {
  try {
    const { meetingId } = req.params;
    
    const meeting = await Meeting.findOne({ meetingId });
    
    if (!meeting) {
      return res.status(404).json({ success: false, error: 'Meeting not found' });
    }
    
    res.json({
      success: true,
      meeting: meeting
    });
    
  } catch (error) {
    console.error('Get meeting error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;