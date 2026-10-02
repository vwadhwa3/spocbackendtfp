const express = require("express");
const {
  saveTravelInfoController,
  getTravelInfoController,
  getAllTravelInfoController,
} = require("../controllers/travelInfo.controller");

const router = express.Router();

// Save / update travel info
router.post("/save", saveTravelInfoController);

// Get all travel info
router.get("/", getAllTravelInfoController);

// Fetch saved travel info for a form
router.get("/:form_id", getTravelInfoController);

module.exports = router;
