const express = require("express");

const router = express.Router();

const {
  createEnumMasterController,
  getAllEnumMasterController,
  getEnumMasterByIdController,
  updateEnumMasterController,
  deleteEnumMasterController,
} = require("../../controllers/Admin/enumMaster.controller");

// Create Enum Master
router.post("/create", createEnumMasterController);

// Get All Enum Master
router.get("/view", getAllEnumMasterController);

// Get Enum Master By ID
router.get("/view/:id", getEnumMasterByIdController);

// Update Enum Master
router.put("/update/:id", updateEnumMasterController);

// Soft Delete Enum Master
router.delete("/delete/:id", deleteEnumMasterController);

module.exports = router;
