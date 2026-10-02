const express = require("express");

const router = express.Router();

const {
  getAllTaskTypesController,
  createTaskController,
  getTasksByUserController,
} = require("../../controllers/Admin/taskType.controller");

// Get All Task Types
router.get("/view", getAllTaskTypesController);

// Create Task
router.post("/create", createTaskController);

router.get("/user/:userId", getTasksByUserController);

module.exports = router;
