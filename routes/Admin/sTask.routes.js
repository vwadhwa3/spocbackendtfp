const express = require("express");

const router = express.Router();

const {
  createSTaskController,
} = require("../../controllers/Admin/sTask.controller");

// Create S_TASK
router.post("/create", createSTaskController);

module.exports = router;
