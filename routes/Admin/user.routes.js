const express = require("express");

const router = express.Router();

const {
  getAllUsersController,
  createUserController,
} = require("../../controllers/Admin/user.controller");

// Get All Users
router.get("/view", getAllUsersController);

// Create User
router.post("/create", createUserController);

module.exports = router;
