const express = require("express");

const router = express.Router();

const { authenticate } = require("../middleware/auth.middleware");
const { ROLES, requireRole } = require("../middleware/role.middleware");
const {
  startInfoFormStageController,
} = require("../controllers/infoForm.controller");

// Retry / manual trigger for the Case Created step. The deposit flow runs it
// automatically; this covers cases approved elsewhere or a failed first run.
// Applied per route because this router is mounted on /api.
const staffOnly = [
  authenticate,
  requireRole(ROLES.SPOC, ROLES.CSR, ROLES.LEAD_CONSULTANT, ROLES.ADMIN),
];

// Start Info Form Stage
router.post(
  "/cases/:caseId/info-form/start",
  staffOnly,
  startInfoFormStageController,
);

module.exports = router;
