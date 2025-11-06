// travel-tour-backend/routes/agoraToken.js
const express = require('express');
const { RtcTokenBuilder, RtcRole } = require('agora-access-token');
const router = express.Router();
const { authMiddleware } = require('./auth');

// Generate Agora token - UPDATED: Consistent user IDs and proper user name handling
router.post('/generate-token', authMiddleware, (req, res) => {
  try {
    const { channelName, uid, userName } = req.body;
    const appId = process.env.AGORA_APP_ID;
    const appCertificate = process.env.AGORA_APP_CERTIFICATE;
    
    if (!appId || !appCertificate) {
      return res.status(500).json({
        success: false,
        message: 'Agora credentials not configured'
      });
    }

    // Use a consistent UID - FIXED: Use user ID from auth token if available
    const consistentUid = req.user?.id || uid || Date.now().toString();
    
    // Token expiration time (1 hour)
    const expirationTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    // Build token with consistent UID
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      consistentUid,
      RtcRole.PUBLISHER,
      privilegeExpiredTs
    );

    // FIXED: Use proper display name from request or user data
    const displayName = userName || req.user?.name || req.user?.username || `User ${consistentUid}`;

    res.json({
      success: true,
      token: token,
      appId: appId,
      channel: channelName,
      uid: consistentUid, // Return consistent UID
      userName: displayName
    });

  } catch (error) {
    console.error('Error generating Agora token:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating token',
      error: error.message
    });
  }
});

module.exports = router;