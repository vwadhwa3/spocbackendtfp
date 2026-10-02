const express = require("express");

const router = express.Router();

const {
  createMaritalStatusController,
  getAllMaritalStatusController,
  getMaritalStatusByIdController,
  updateMaritalStatusController,
  deleteMaritalStatusController,
} = require("../../controllers/Admin/maritalStatus.controller");

// Create Marital Status
router.post("/create", createMaritalStatusController);

// Get All Marital Statuses
router.get("/view", getAllMaritalStatusController);

// Get Marital Status By ID
router.get("/view/:id", getMaritalStatusByIdController);

// Update Marital Status
router.put("/update/:id", updateMaritalStatusController);

// Delete Marital Status
router.delete("/delete/:id", deleteMaritalStatusController);

module.exports = router;
