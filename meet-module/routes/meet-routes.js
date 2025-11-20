const express = require('express');
const router = express.Router();
const MeetService = require('../services/meet-service');

// 🆕 ENHANCED CREATE MEETING ENDPOINT
router.post('/create', async (req, res) => {
  try {
    const { adminId, title, description, adminName } = req.body;
    
    if (!adminId) {
      return res.status(400).json({
        success: false,
        error: 'Admin ID is required'
      });
    }

    const result = await MeetService.createMeeting(adminId, title, description, adminName);
    
    if (result.success) {
      res.json({
        success: true,
        meeting: result.meeting,
        joinLinks: {
          primary: result.meetingLink,
          direct: result.directJoinLink,
          instant: result.instantJoinLink
        },
        message: 'Meeting created with seamless join enabled'
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        details: result.details
      });
    }
  } catch (error) {
    console.error('Error in create meeting route:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// 🆕 ENHANCED JOIN MEETING ENDPOINT
router.post('/:meetingId/join', async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { userId, userName } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    const result = await MeetService.joinMeeting(meetingId, userId, userName || 'Participant');
    
    if (result.success) {
      res.json({
        success: true,
        joinLinks: result.joinLinks,
        message: result.message
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error in join meeting route:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// 🆕 ENHANCED GET ACTIVE MEETING
router.get('/active', async (req, res) => {
  try {
    const result = await MeetService.getActiveMeeting();
    
    if (result.success) {
      res.json({
        success: true,
        meeting: result.meeting,
        seamlessJoin: true,
        directLinks: {
          primary: result.meeting.meetingLink,
          direct: result.meeting.directJoinLink,
          instant: result.meeting.instantJoinLink
        }
      });
    } else {
      res.json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    console.error('Error getting active meeting:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// EXTEND MEETING ENDPOINT
router.post('/:meetingId/extend', async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { adminId } = req.body;

    if (!adminId) {
      return res.status(400).json({
        success: false,
        error: 'Admin ID is required'
      });
    }

    const result = await MeetService.extendMeeting(meetingId, adminId);
    
    if (result.success) {
      res.json({
        success: true,
        meeting: result.meeting,
        message: result.message
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error extending meeting:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// END MEETING ENDPOINT
router.post('/:meetingId/end', async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { adminId } = req.body;

    if (!adminId) {
      return res.status(400).json({
        success: false,
        error: 'Admin ID is required'
      });
    }

    const result = await MeetService.endMeeting(meetingId, adminId);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error ending meeting:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// CLEAR ALL MEETINGS ENDPOINT
router.delete('/clear-all', async (req, res) => {
  try {
    const result = await MeetService.clearAllMeetings();
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error clearing meetings:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// GET MEETING BY ID
router.get('/:meetingId', async (req, res) => {
  try {
    const { meetingId } = req.params;
    const result = await MeetService.getMeetingById(meetingId);
    
    if (result.success) {
      res.json({
        success: true,
        meeting: result.meeting
      });
    } else {
      res.status(404).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error getting meeting:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// GET ALL MEETINGS (admin only)
router.get('/', async (req, res) => {
  try {
    const result = await MeetService.getAllMeetings();
    
    if (result.success) {
      res.json({
        success: true,
        meetings: result.meetings
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error getting all meetings:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// HEALTH CHECK ENDPOINT
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Meet module is working properly',
    timestamp: new Date().toISOString(),
    seamlessJoin: true
  });
});

module.exports = router;