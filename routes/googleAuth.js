// travel-tour-backend/routes/googleAuth.js - FIXED VERSION
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const axios = require('axios'); // Added for Google API calls
const User = require('../models/User');
const { OAuth2Client } = require('google-auth-library');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Helper function to verify access token with Google API
async function verifyAccessToken(accessToken) {
  try {
    const response = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { 
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    return {
      success: true,
      userInfo: response.data
    };
  } catch (error) {
    console.error('❌ Google API verification failed:', error.message);
    return {
      success: false,
      error: error.response?.data || error.message
    };
  }
}

// Google authentication endpoint - UPDATED TO HANDLE BOTH TOKEN TYPES
router.post('/google', async (req, res) => {
  try {
    const { token, access_token, googleId, email, name, picture, given_name, family_name, email_verified } = req.body;
    
    console.log('🔄 Processing Google sign-in request:', {
      hasToken: !!token,
      hasAccessToken: !!access_token,
      hasUserInfo: !!(email || googleId),
      tokenType: token?.startsWith('ya29.') ? 'ACCESS_TOKEN' : 'ID_TOKEN'
    });
    
    let googleIdToUse, emailToUse, nameToUse, pictureToUse, givenName, familyName, isEmailVerified;
    
    // SCENARIO 1: We have an access_token (starts with ya29.)
    if (access_token && access_token.startsWith('ya29.')) {
      console.log('🔑 Detected access_token, verifying with Google API...');
      
      const verificationResult = await verifyAccessToken(access_token);
      
      if (!verificationResult.success) {
        return res.status(401).json({
          success: false,
          message: 'Failed to verify Google access token',
          code: 'INVALID_ACCESS_TOKEN'
        });
      }
      
      const userInfo = verificationResult.userInfo;
      googleIdToUse = userInfo.sub;
      emailToUse = userInfo.email;
      nameToUse = userInfo.name;
      pictureToUse = userInfo.picture;
      givenName = userInfo.given_name;
      familyName = userInfo.family_name;
      isEmailVerified = userInfo.email_verified;
      
      console.log('✅ Access token verified, user info:', {
        email: emailToUse,
        googleId: googleIdToUse,
        name: nameToUse
      });
    }
    // SCENARIO 2: We have direct user info from frontend
    else if (googleId && email) {
      console.log('📝 Using direct user info from frontend');
      googleIdToUse = googleId;
      emailToUse = email;
      nameToUse = name;
      pictureToUse = picture;
      givenName = given_name;
      familyName = family_name;
      isEmailVerified = email_verified;
    }
    // SCENARIO 3: We have an ID token (traditional JWT)
    else if (token && !token.startsWith('ya29.')) {
      try {
        console.log('🔐 Verifying ID token...');
        const ticket = await client.verifyIdToken({
          idToken: token,
          audience: process.env.GOOGLE_CLIENT_ID
        });
        
        const payload = ticket.getPayload();
        googleIdToUse = payload.sub;
        emailToUse = payload.email;
        nameToUse = payload.name;
        pictureToUse = payload.picture;
        givenName = payload.given_name;
        familyName = payload.family_name;
        isEmailVerified = payload.email_verified;
        
        console.log('✅ ID token verified successfully');
      } catch (idTokenError) {
        console.error('❌ ID token verification failed:', idTokenError.message);
        return res.status(401).json({
          success: false,
          message: 'Invalid Google ID token',
          code: 'INVALID_ID_TOKEN'
        });
      }
    }
    // SCENARIO 4: We have a token but can't determine type
    else if (token) {
      console.log('⚠️ Ambiguous token type, trying both methods...');
      
      // Try as access token first
      if (token.startsWith('ya29.')) {
        const verificationResult = await verifyAccessToken(token);
        if (verificationResult.success) {
          const userInfo = verificationResult.userInfo;
          googleIdToUse = userInfo.sub;
          emailToUse = userInfo.email;
          nameToUse = userInfo.name;
          pictureToUse = userInfo.picture;
          givenName = userInfo.given_name;
          familyName = userInfo.family_name;
          isEmailVerified = userInfo.email_verified;
        } else {
          return res.status(401).json({
            success: false,
            message: 'Invalid Google token format',
            code: 'INVALID_TOKEN_FORMAT'
          });
        }
      } else {
        // Try as ID token
        try {
          const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID
          });
          const payload = ticket.getPayload();
          googleIdToUse = payload.sub;
          emailToUse = payload.email;
          nameToUse = payload.name;
          pictureToUse = payload.picture;
          givenName = payload.given_name;
          familyName = payload.family_name;
          isEmailVerified = payload.email_verified;
        } catch (error) {
          return res.status(401).json({
            success: false,
            message: 'Invalid Google token',
            code: 'INVALID_TOKEN'
          });
        }
      }
    }
    else {
      return res.status(400).json({
        success: false,
        message: 'No authentication data provided',
        code: 'MISSING_AUTH_DATA'
      });
    }
    
    // Validate we have required data
    if (!googleIdToUse || !emailToUse) {
      return res.status(400).json({
        success: false,
        message: 'Missing required user information',
        code: 'MISSING_USER_INFO'
      });
    }
    
    console.log('🔍 Looking for existing user:', { email: emailToUse, googleId: googleIdToUse });
    
    // Check if user exists
    let user = await User.findOne({ 
      $or: [
        { email: emailToUse },
        { googleId: googleIdToUse }
      ] 
    });

    if (user) {
      console.log('✅ Found existing user:', user.username);
      
      // Update existing user with Google info if needed
      if (!user.googleId || user.authProvider !== 'google') {
        console.log('🔄 Updating user with Google info...');
        user.googleId = googleIdToUse;
        user.authProvider = 'google';
        user.profilePicture = pictureToUse || user.profilePicture;
        
        // Update profile info if available
        if (givenName && !user.profile?.firstName) {
          user.profile = user.profile || {};
          user.profile.firstName = givenName;
        }
        if (familyName && !user.profile?.lastName) {
          user.profile = user.profile || {};
          user.profile.lastName = familyName;
        }
        
        await user.save();
        console.log('✅ User updated with Google info');
      }
    } else {
      // Create new user for Google sign-up
      console.log('🆕 Creating new Google user...');
      
      user = new User({
        username: nameToUse || emailToUse.split('@')[0],
        email: emailToUse,
        googleId: googleIdToUse,
        authProvider: 'google',
        profilePicture: pictureToUse || '',
        password: null, // No password for Google users
        profile: {
          firstName: givenName || '',
          lastName: familyName || ''
        },
        emailVerified: isEmailVerified || false,
        stats: {
          loginCount: 1,
          lastLogin: new Date(),
          googleSignInCount: 1,
          lastGoogleSignIn: new Date()
        }
      });
      
      await user.save();
      console.log('✅ New Google user created:', user.username);
    }

    // Update login stats
    user.stats.loginCount = (user.stats.loginCount || 0) + 1;
    user.stats.lastLogin = new Date();
    user.stats.googleSignInCount = (user.stats.googleSignInCount || 0) + 1;
    user.stats.lastGoogleSignIn = new Date();
    await user.save();

    // Generate JWT token for your app
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

    console.log('✅ Authentication successful for:', user.email);
    console.log('✅ JWT token generated, user role:', user.role);

    res.json({
      success: true,
      token: jwtToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture,
        authProvider: user.authProvider,
        stats: user.stats
      },
      message: 'Google authentication successful'
    });

  } catch (error) {
    console.error('❌ Google auth error details:', {
      message: error.message,
      stack: error.stack,
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
    
    if (error.message.includes('Wrong number of segments in token')) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid token format. Please sign in again.',
        code: 'INVALID_TOKEN_FORMAT'
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