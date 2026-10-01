const { validatePaymentArray, validateDiscountAmount, validateDiscountReason, validateCaseId } = require("../utils/validators");

const validateDepositSubmission = (req, res, next) => {
  const { payments } = req.body;
  
  const errors = validatePaymentArray(payments);
  
  if (errors) {
    return res.status(400).json({
      success: false,
      error: "VALIDATION_ERROR",
      details: Array.isArray(errors) ? errors : [{ field: "payments", message: errors }],
    });
  }
  
  next();
};

const validateDiscountCreation = (req, res, next) => {
  const { case_id, amount, reason } = req.body;
  
  const errors = [];
  
  const caseIdError = validateCaseId(case_id);
  if (caseIdError) errors.push({ field: "case_id", message: caseIdError });
  
  const amountError = validateDiscountAmount(amount);
  if (amountError) errors.push({ field: "amount", message: amountError });
  
  const reasonError = validateDiscountReason(reason);
  if (reasonError) errors.push({ field: "reason", message: reasonError });
  
  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: "VALIDATION_ERROR",
      details: errors,
    });
  }
  
  next();
};

const validateCaseIdParam = (req, res, next) => {
  const { caseId } = req.params;
  
  const error = validateCaseId(caseId);
  
  if (error) {
    return res.status(400).json({
      success: false,
      error: "VALIDATION_ERROR",
      details: [{ field: "caseId", message: error }],
    });
  }
  
  req.params.caseId = parseInt(caseId);
  next();
};

module.exports = {
  validateDepositSubmission,
  validateDiscountCreation,
  validateCaseIdParam,
};