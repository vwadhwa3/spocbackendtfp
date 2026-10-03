const express = require("express");

const router = express.Router();

const { authenticateCustomer } = require("../middleware/auth.middleware");
const {
  customerLoginController,
  getCustomerCasesController,
  submitApplicantFormController,
} = require("../controllers/infoForm.controller");

// Customer Login
router.post("/auth/login", customerLoginController);

// Get Customer Cases
router.get("/cases", authenticateCustomer, getCustomerCasesController);

// Submit Applicant Info Form
router.post(
  "/applications/:applicationId/info-form/submit",
  authenticateCustomer,
  submitApplicantFormController,
);

module.exports = router;
