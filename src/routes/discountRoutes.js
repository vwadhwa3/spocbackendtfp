const express = require("express");
const router = express.Router();

const { authenticate } = require("../middleware/authMiddleware");
const { requireLeadConsultantOrAdmin } = require("../middleware/roleMiddleware");
const { validateDiscountCreation, validateCaseIdParam } = require("../middleware/validationMiddleware");

const discountController = require("../controllers/discountController");

router.use(authenticate);

router.post("/discounts", requireLeadConsultantOrAdmin, validateDiscountCreation, discountController.createDiscount);

router.get("/cases/:caseId/discounts", validateCaseIdParam, requireLeadConsultantOrAdmin, discountController.getDiscountsByCase);

module.exports = router;