const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { queryOne } = require("../utils/db");

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: "Email and password are required",
      });
    }

    const user = await queryOne(
      `SELECT user_id, email, password_hash, role_id, first_name, last_name, timezone, is_active
       FROM users WHERE email = $1`,
      [email]
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        error: "INVALID_CREDENTIALS",
        message: "Invalid email or password",
      });
    }

    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        error: "ACCOUNT_INACTIVE",
        message: "Account is deactivated",
      });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        error: "INVALID_CREDENTIALS",
        message: "Invalid email or password",
      });
    }

    const jwtSecret = process.env.JWT_SECRET || "your-super-secret-jwt-key-change-in-production";
    const token = jwt.sign(
      { userId: user.user_id, roleId: user.role_id },
      jwtSecret,
      { expiresIn: "8h" }
    );

    res.cookie('token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax'
    });

    return res.json({
      success: true,
      data: {
        token,
        user: {
          userId: user.user_id,
          email: user.email,
          roleId: user.role_id,
          firstName: user.first_name,
          lastName: user.last_name,
          timezone: user.timezone || "UTC",
        },
      },
    });
  } catch (error) {
    console.error("Login error:", error.message, error.stack);
    return res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: "Login failed",
    });
  }
});

module.exports = router;