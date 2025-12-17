// travel-tour-backend/routes/auth.js

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

require('dotenv').config();

// Helper function to generate a JWT token
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role,
      username: user.username,
    },
    process.env.JWT_SECRET,
    { expiresIn: '1d' }
  );
};

// Add password validation function
const validatePassword = (password) => {
  if (password.length < 6) {
    return 'Password must be at least 6 characters long';
  }
  return null;
};

// Middleware to check if user is authenticated
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verify user exists and is active
    const user = await User.findById(decoded.id);
    if (!user || !user.active) {
      return res.status(401).json({ success: false, message: 'User not found or inactive' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// 🚨 ADDED: Admin middleware - check if user is admin
const adminMiddleware = (req, res, next) => {
  try {
    // Check if user is authenticated and is admin
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error in admin verification'
    });
  }
};

// Route to handle user registration
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, firstName, lastName, phone } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ success: false, message: 'Please enter all required fields.' });
    }

    // Validate password strength
    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ success: false, message: passwordError });
    }

    // Check if username or email already exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });
    
    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(400).json({ success: false, message: 'User with that email already exists.' });
      }
      if (existingUser.username === username) {
        return res.status(400).json({ success: false, message: 'Username already taken.' });
      }
    }

    // Create user with enhanced profile data
    const newUser = new User({
      username,
      email,
      password,
      role: 'student', // Changed from 'user' to 'student'
      profile: {
        firstName: firstName || '',
        lastName: lastName || '',
        phone: phone || ''
      },
      // Other fields will use their defaults from the model
    });

    const savedUser = await newUser.save();
    const token = generateToken(savedUser);

    // Update last login stats
    savedUser.stats.lastLogin = new Date();
    savedUser.stats.loginCount += 1;
    await savedUser.save();

    res.status(201).json({
      success: true,
      message: 'Registration successful!',
      token,
      user: {
        id: savedUser._id,
        username: savedUser.username,
        email: savedUser.email,
        role: savedUser.role,
        profile: savedUser.profile,
        stats: savedUser.stats,
        preferences: savedUser.preferences,
        unreadMessages: savedUser.unreadMessages
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Route to handle user login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please enter all fields.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid credentials.' });
    }

    if (!user.active) {
      return res.status(400).json({ success: false, message: 'Account is deactivated. Please contact administrator.' });
    }

    // Use the model method for password comparison
    const isMatch = await user.correctPassword(password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Invalid credentials.' });
    }

    // Update login statistics
    user.stats.lastLogin = new Date();
    user.stats.loginCount += 1;
    await user.save();

    const token = generateToken(user);

    res.status(200).json({
      success: true,
      message: 'Login successful!',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        profile: user.profile,
        stats: user.stats,
        preferences: user.preferences,
        unreadMessages: user.unreadMessages,
        active: user.active
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Change password reset to POST to match frontend
router.post('/reset-password', async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      return res.status(400).json({ success: false, message: 'Email and new password are required.' });
    }

    // Validate new password
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return res.status(400).json({ success: false, message: passwordError });
    }

    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal whether email exists for security
      return res.status(200).json({ 
        success: true, 
        message: 'If this email exists, a reset link has been sent.' 
      });
    }

    if (!user.active) {
      return res.status(400).json({ success: false, message: 'Account is deactivated. Please contact administrator.' });
    }

    // Update password - let the model handle hashing
    user.password = newPassword;
    await user.save();

    const token = generateToken(user);

    res.status(200).json({
      success: true,
      message: 'Password reset successfully!',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        profile: user.profile,
        stats: user.stats
      },
    });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get current user profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    res.json({
      success: true,
      user: {
        id: req.user._id,
        username: req.user.username,
        email: req.user.email,
        role: req.user.role,
        profile: req.user.profile,
        stats: req.user.stats,
        preferences: req.user.preferences,
        unreadMessages: req.user.unreadMessages,
        active: req.user.active,
        createdAt: req.user.createdAt
      }
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ success: false, message: 'Error fetching profile' });
  }
});

// Update user profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { firstName, lastName, phone, bio, avatar, emailNotifications, pushNotifications } = req.body;

    // Update profile fields if provided
    if (firstName !== undefined) req.user.profile.firstName = firstName;
    if (lastName !== undefined) req.user.profile.lastName = lastName;
    if (phone !== undefined) req.user.profile.phone = phone;
    if (bio !== undefined) req.user.profile.bio = bio;
    if (avatar !== undefined) req.user.profile.avatar = avatar;

    // Update preferences if provided
    if (emailNotifications !== undefined) req.user.preferences.emailNotifications = emailNotifications;
    if (pushNotifications !== undefined) req.user.preferences.pushNotifications = pushNotifications;

    await req.user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: req.user._id,
        username: req.user.username,
        email: req.user.email,
        role: req.user.role,
        profile: req.user.profile,
        preferences: req.user.preferences
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ success: false, message: 'Error updating profile' });
  }
});

// Mark messages as read
router.post('/messages/mark-read', authMiddleware, async (req, res) => {
  try {
    await req.user.markMessagesAsRead();
    
    res.json({
      success: true,
      message: 'Messages marked as read',
      unreadMessages: 0
    });
  } catch (error) {
    console.error('Mark messages read error:', error);
    res.status(500).json({ success: false, message: 'Error marking messages as read' });
  }
});

// Verify token endpoint
router.get('/verify', authMiddleware, async (req, res) => {
  try {
    res.json({
      success: true,
      user: {
        id: req.user._id,
        username: req.user.username,
        email: req.user.email,
        role: req.user.role,
        profile: req.user.profile,
        stats: req.user.stats,
        preferences: req.user.preferences,
        unreadMessages: req.user.unreadMessages,
        active: req.user.active
      }
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
});

module.exports = {
  router,
  authMiddleware, // Critical export used by messages.js and other routes
  adminMiddleware  // 🚨 ADDED: Now adminMiddleware is exported for admin routes
};