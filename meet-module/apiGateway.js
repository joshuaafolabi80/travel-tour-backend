// travel-tour-backend/meet-module/apiGateway.js
const express = require('express');
const router = express.Router();

class MeetModuleGateway {
  static async createMeeting(adminId, title) {
    try {
      const response = await fetch('http://localhost:3001/api/meetings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId, title })
      });
      return response.json();
    } catch (error) {
      console.error('Meet module create meeting error:', error);
      return { success: false, error: 'Meet module unavailable' };
    }
  }

  static async getActiveMeeting() {
    try {
      const response = await fetch('http://localhost:3001/api/meetings/active');
      return response.json();
    } catch (error) {
      console.error('Meet module get active meeting error:', error);
      return { success: false, error: 'Meet module unavailable' };
    }
  }

  static async shareResource(resourceData) {
    try {
      const response = await fetch('http://localhost:3001/api/resources/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resourceData)
      });
      return response.json();
    } catch (error) {
      console.error('Meet module share resource error:', error);
      return { success: false, error: 'Meet module unavailable' };
    }
  }

  static async uploadFile(formData) {
    try {
      const response = await fetch('http://localhost:3001/api/uploads/upload', {
        method: 'POST',
        body: formData,
      });
      return response.json();
    } catch (error) {
      console.error('Meet module upload file error:', error);
      return { success: false, error: 'Meet module unavailable' };
    }
  }

  static async healthCheck() {
    try {
      const response = await fetch('http://localhost:3001/health');
      return response.json();
    } catch (error) {
      console.error('Meet module health check error:', error);
      return { success: false, error: 'Meet module unavailable' };
    }
  }
}

// Routes that forward requests to the meet module
router.post('/create', async (req, res) => {
  const result = await MeetModuleGateway.createMeeting(req.body.adminId, req.body.title);
  res.json(result);
});

router.get('/active', async (req, res) => {
  const result = await MeetModuleGateway.getActiveMeeting();
  res.json(result);
});

router.get('/health', async (req, res) => {
  const result = await MeetModuleGateway.healthCheck();
  res.json(result);
});

module.exports = { MeetModuleGateway, router };