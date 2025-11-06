// travel-tour-backend/routes/agoraToken.js
const express = require('express');
const { RtcTokenBuilder, RtcRole } = require('agora-access-token');
const router = express.Router();
const { authMiddleware } = require('./auth');

// Generate Agora token - FIXED: Proper user name handling
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

    // Token expiration time (1 hour)
    const expirationTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    // Build token with uid
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      uid,
      RtcRole.PUBLISHER,
      privilegeExpiredTs
    );

    // FIXED: Proper user name handling to show actual names instead of IDs
    const displayName = userName || req.user.name || req.user.username || `User ${uid}`;

    res.json({
      success: true,
      token: token,
      appId: appId,
      channel: channelName,
      uid: uid,
      userName: displayName // Send proper display name
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