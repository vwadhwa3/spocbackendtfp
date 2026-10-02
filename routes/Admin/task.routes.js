const express = require("express");

const router = express.Router();

const {
  createTaskController,
  getAllTasksController,
  getTaskByIdController,
  updateTaskController,
} = require("../../controllers/Admin/task.controller");

// Create Task
router.post("/create", createTaskController);

// View All Tasks
router.get("/view", getAllTasksController);

// View Task by Id
router.get("/view/:id", getTaskByIdController);

// Update Task
router.put("/update/:id", updateTaskController);

module.exports = router;
