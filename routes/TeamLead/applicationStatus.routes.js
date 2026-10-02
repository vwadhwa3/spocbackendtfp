const express = require("express");
const router = express.Router();

const {
  updateApplicationStatusToCustomerReviewController,
} = require("../../controllers/TeamLead/applicationStatus.controller");

// Team Lead → Documents in Customer Review
router.patch(
  "/:application_id/customer-review",
  updateApplicationStatusToCustomerReviewController,
);

module.exports = router;
