// travel-tour-backend/routes/googleAuth.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { OAuth2Client } = require('google-auth-library');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Google authentication endpoint
router.post('/google', async (req, res) => {
  try {
    const { token } = req.body;
    
    // Verify Google token
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Check if user exists
    let user = await User.findOne({ 
      $or: [{ email }, { googleId }] 
    });

    if (user) {
      // Update existing user with Google info if needed
      if (!user.googleId) {
        user.googleId = googleId;
        user.authProvider = 'google';
        user.profilePicture = picture;
        await user.save();
      }
    } else {
      // Create new user for Google sign-up
      user = new User({
        username: name,
        email,
        googleId,
        authProvider: 'google',
        profilePicture: picture,
        password: null // No password for Google users
      });
      await user.save();
    }

    // Generate JWT token
    const jwtToken = jwt.sign(
      { 
        id: user._id, 
        email: user.email, 
        role: user.role,
        authProvider: user.authProvider 
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token: jwtToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture,
        authProvider: user.authProvider
      }
    });

  } catch (error) {
    console.error('❌ Google auth error details:', {
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
      code: error.code
    });
    
    // More specific error responses
    if (error.message.includes('invalid_token') || error.code === 'invalid_token') {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid Google token. Please try signing in again.',
        code: 'INVALID_TOKEN'
      });
    }
    
    if (error.message.includes('Client is unauthorized')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Google OAuth client not authorized. Check your Google Cloud settings.',
        code: 'UNAUTHORIZED_CLIENT'
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Google authentication failed. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      code: 'SERVER_ERROR'
    });
  }
});

module.exports = router;