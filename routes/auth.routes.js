const express = require("express");

const router = express.Router();

const { authenticate } = require("../middleware/auth.middleware");
const {
  loginController,
  verifyController,
} = require("../controllers/auth.controller");

// Login
router.post("/login", loginController);

// Verify Token
router.get("/verify", authenticate, verifyController);

module.exports = router;
