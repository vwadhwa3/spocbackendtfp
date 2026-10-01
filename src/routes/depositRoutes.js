const express = require("express");
const router = express.Router();

const { authenticate } = require("../middleware/authMiddleware");
const { requireSPOC, requireSPOCorLeadConsultantOrAdmin } = require("../middleware/roleMiddleware");
const { validateDepositSubmission, validateCaseIdParam } = require("../middleware/validationMiddleware");

const depositController = require("../controllers/depositController");

router.use(authenticate);

router.get("/bank-accounts/enabled", requireSPOCorLeadConsultantOrAdmin, require("../controllers/bankAccountController").getEnabledBankAccounts);

router.get("/cases/:caseId/deposit/minimum", validateCaseIdParam, requireSPOCorLeadConsultantOrAdmin, depositController.getMinimumDeposit);

router.post("/cases/:caseId/deposit", validateCaseIdParam, requireSPOC, validateDepositSubmission, depositController.submitDeposit);

router.get("/cases/:caseId/deposit/payments", validateCaseIdParam, requireSPOCorLeadConsultantOrAdmin, depositController.getPayments);

module.exports = router;