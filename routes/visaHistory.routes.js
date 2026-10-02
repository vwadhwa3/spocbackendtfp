const express = require("express");
const {
  saveVisaHistoryController,
  getVisaHistoryController,
  getAllVisaHistoryController,
} = require("../controllers/visaHistory.controller");

const router = express.Router();

// Save / update visa history details
router.post("/save", saveVisaHistoryController);

// Get all visa history
router.get("/", getAllVisaHistoryController);

// Fetch saved visa history details for a form
router.get("/:form_id", getVisaHistoryController);

module.exports = router;
