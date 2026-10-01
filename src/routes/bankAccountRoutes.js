const express = require("express");
const router = express.Router();

const { authenticate } = require("../middleware/authMiddleware");
const { requireSPOCorLeadConsultantOrAdmin } = require("../middleware/roleMiddleware");

const bankAccountController = require("../controllers/bankAccountController");

router.use(authenticate);

router.get("/enabled", requireSPOCorLeadConsultantOrAdmin, bankAccountController.getEnabledBankAccounts);

module.exports = router;