const express = require("express");

const router = express.Router();

const {
  updateApplicationStatusController,
  updateApplicationInformationReviewController,
} = require("../../controllers/CSR/applicationStatus.controller");

// CSR: Move application to Documents in TL Review
router.patch("/:application_id/review", updateApplicationStatusController);

// CSR: Move application to Application Information For Review
router.patch(
  "/:application_id/application-review",
  updateApplicationInformationReviewController,
);

module.exports = router;
