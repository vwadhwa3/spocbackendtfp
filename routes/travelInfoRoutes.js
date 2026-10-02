const express = require("express");
const { saveTravelInfoDoc, getTravelInfoDoc, getAllTravelInfoDocs } = require("../controllers/travelInfoController");

const router = express.Router();

// Save / update travel info
router.post("/save", saveTravelInfoDoc);

// Get all travel info
router.get("/", getAllTravelInfoDocs);

// Fetch saved travel info for a form
router.get("/:form_id", getTravelInfoDoc);

module.exports = router;
