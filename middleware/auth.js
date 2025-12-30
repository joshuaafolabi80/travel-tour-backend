// travel-tour-backend/middleware/auth.js

const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
    try {
        // 1. Get token from header
        const token = req.header('Authorization')?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No authentication token, access denied'
            });
        }

        // 2. Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // 3. Find user
        const user = await User.findById(decoded.id).select('-password');
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        // 4. Attach user to request object
        req.user = user;
        req.token = token;
        next();

    } catch (error) {
        console.error('Auth middleware error:', error.message);
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Server authentication error'
        });
    }
};

const adminAuth = async (req, res, next) => {
    try {
        // First run regular auth
        // Note: Using a wrapper to handle the next() call within the try-catch
        await authMiddleware(req, res, () => {
            // This inner callback runs if authMiddleware calls next()
            if (req.user && req.user.role === 'admin') {
                next();
            } else {
                res.status(403).json({
                    success: false,
                    message: 'Access denied. Admin privileges required.'
                });
            }
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Admin auth error'
        });
    }
};

// EXPORTS: 
// We keep authMiddleware for existing files
// We add 'auth' as an alias for the appReviewRoutes.js file
module.exports = { 
    authMiddleware, 
    auth: authMiddleware, 
    adminAuth 
};