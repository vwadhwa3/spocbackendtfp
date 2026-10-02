const express = require("express");
const { saveVisaHistoryDoc, getVisaHistoryDoc, getAllVisaHistoryDocs } = require("../controllers/visaHistoryController");

const router = express.Router();

// Save / update visa history details
router.post("/save", saveVisaHistoryDoc);

// Get all visa history
router.get("/", getAllVisaHistoryDocs);

// Fetch saved visa history details for a form
router.get("/:form_id", getVisaHistoryDoc);

module.exports = router;