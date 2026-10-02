const { validatePaymentArray, validateCaseId } = require("../utils/validators");

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
  validateCaseIdParam,
};