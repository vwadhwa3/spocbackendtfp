const jwt = require("jsonwebtoken");
const { queryOne } = require("../utils/db");

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization ;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: "UNAUTHORIZED",
        message: "Authorization header with Bearer token required",
      });
    }
    
    const token = authHeader.split(" ")[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: "UNAUTHORIZED",
        message: "Token missing",
      });
    }
    
    const jwtSecret = process.env.JWT_SECRET || "your-super-secret-jwt-key-change-in-production";
    
    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret);
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        error: "INVALID_TOKEN",
        message: "Invalid or expired token",
      });
    }
    
    const user = await queryOne(
      `SELECT user_id, email, role_id, first_name, last_name, timezone 
       FROM users 
       WHERE user_id = $1 AND is_active = true`,
      [decoded.userId || decoded.id]
    );
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: "USER_NOT_FOUND",
        message: "User not found or inactive",
      });
    }
    
    req.user = {
      userId: user.user_id,
      email: user.email,
      roleId: user.role_id,
      firstName: user.first_name,
      lastName: user.last_name,
      timezone: user.timezone || "UTC",
    };
    
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(500).json({
      success: false,
      error: "AUTH_ERROR",
      message: "Authentication failed",
    });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next();
    }
    
    const token = authHeader.split(" ")[1];
    
    if (!token) {
      return next();
    }
    
    const jwtSecret = process.env.JWT_SECRET || "your-super-secret-jwt-key-change-in-production";
    
    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret);
    } catch (jwtError) {
      return next();
    }
    
    const user = await queryOne(
      `SELECT user_id, email, role_id, first_name, last_name, timezone 
       FROM users 
       WHERE user_id = $1 AND is_active = true`,
      [decoded.userId || decoded.id]
    );
    
    if (user) {
      req.user = {
        userId: user.user_id,
        email: user.email,
        roleId: user.role_id,
        firstName: user.first_name,
        lastName: user.last_name,
        timezone: user.timezone || "UTC",
      };
    }
    
    next();
  } catch (error) {
    next();
  }
};

module.exports = {
  authenticate,
  optionalAuth,
};