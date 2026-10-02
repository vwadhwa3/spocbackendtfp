const express = require("express");

const router = express.Router();

const { authenticate } = require("../middleware/auth.middleware");
const { ROLES, requireRole } = require("../middleware/role.middleware");
const {
  getEnabledBankAccountsController,
  getCaseDepositController,
  getPaymentsController,
  submitDepositController,
} = require("../controllers/deposit.controller");

// Deposit entry is SPOC-only, enforced here and not just hidden in the UI.
// Applied per route, not via router.use(), because this router is mounted on
// /api and router-level middleware would gate every /api/* path.
const spocOnly = [authenticate, requireRole(ROLES.SPOC)];

// Get Enabled Bank Accounts
router.get(
  "/bank-accounts/enabled",
  spocOnly,
  getEnabledBankAccountsController,
);

// Get Deposit Summary For Case
router.get(
  "/cases/:caseId/deposit/minimum",
  spocOnly,
  getCaseDepositController,
);

// Get Payments For Case
router.get("/cases/:caseId/deposit/payments", spocOnly, getPaymentsController);

// Submit Initial Deposit
router.post("/cases/:caseId/deposit", spocOnly, submitDepositController);

module.exports = router;
