const express = require("express");

const router = express.Router();

const {
  createApplicationReviewTaskController,
  reviewApplicationController,
  getApplicationChecklistController,
  generateApplicationChecklistController,
  sendApplicationChecklistController,
} = require("../../controllers/TeamLead/applicationReview.controller");

// Team Lead: Create Review Application Information task
router.post(
  "/:application_id/create-task",
  createApplicationReviewTaskController,
);

// Team Lead: Review Application Information
router.patch("/:application_id/review", reviewApplicationController);

// Team Lead: View Application Document Checklist
router.get("/:application_id/checklist", getApplicationChecklistController);

// Team Lead: Generate / Save Document Checklist
router.post(
  "/:application_id/checklist",
  generateApplicationChecklistController,
);

// Team Lead: Send Document Checklist to Customer
router.post(
  "/:application_id/checklist/send",
  sendApplicationChecklistController,
);

module.exports = router;
