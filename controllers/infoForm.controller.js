const {
  startInfoFormStageService,
  customerLoginService,
  getCustomerCasesService,
  submitApplicantFormService,
} = require("../services/infoForm.service");

const sendError = (res, error) => {
  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      error: error.error,
      message: error.message,
    });
  }

  console.error("Info Form Error:", error);
  return res.status(500).json({
    success: false,
    error: "INTERNAL_ERROR",
    message: "Something went wrong",
  });
};

// Wraps a handler so every info form endpoint shares the same error response.
const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (error) {
    sendError(res, error);
  }
};

const parseId = (req, name, label) => {
  const id = Number(req.params[name]);
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error(`${label} must be a positive integer`);
    error.statusCode = 400;
    error.error = "VALIDATION_ERROR";
    throw error;
  }
  return id;
};

// Start Info Form Stage
const startInfoFormStageController = handle(async (req, res) => {
  const data = await startInfoFormStageService(
    parseId(req, "caseId", "Case ID"),
    req.user.userId,
  );
  res.json({ success: true, data });
});

// Customer Login
const customerLoginController = handle(async (req, res) => {
  const data = await customerLoginService(req.body ?? {});
  res.json({ success: true, data });
});

// Get Customer Cases
const getCustomerCasesController = handle(async (req, res) => {
  const data = await getCustomerCasesService(req.customer.contactIds);
  res.json({ success: true, data });
});

// Submit Applicant Info Form
const submitApplicantFormController = handle(async (req, res) => {
  const data = await submitApplicantFormService(
    parseId(req, "applicationId", "Application ID"),
    req.customer.contactIds,
  );
  res.json({ success: true, data });
});

module.exports = {
  startInfoFormStageController,
  customerLoginController,
  getCustomerCasesController,
  submitApplicantFormController,
};
