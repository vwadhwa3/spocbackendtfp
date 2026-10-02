const express = require("express");

const router = express.Router();

const {
  createAppStatusController,
  getAllAppStatusController,
  getAppStatusByIdController,
  updateAppStatusController,
  deleteAppStatusController,
} = require("../../controllers/Admin/appStatus.controller");

// Create Application Status
router.post("/create", createAppStatusController);

// Get All Application Statuses
router.get("/view", getAllAppStatusController);

// Get Application Status By ID
router.get("/view/:id", getAppStatusByIdController);

// Update Application Status
router.put("/update/:id", updateAppStatusController);

// Soft Delete Application Status
router.delete("/delete/:id", deleteAppStatusController);

module.exports = router;
