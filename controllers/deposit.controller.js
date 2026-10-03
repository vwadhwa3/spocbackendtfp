const {
  getEnabledBankAccountsService,
  getCaseDepositService,
  getPaymentsService,
  submitDepositService,
  reviewDepositService,
} = require("../services/deposit.service");

const sendError = (res, error) => {
  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      error: error.error,
      message: error.message,
      ...(error.details && { details: error.details }),
    });
  }

  console.error("Deposit Error:", error);
  return res.status(500).json({
    success: false,
    error: "INTERNAL_ERROR",
    message: "Something went wrong",
  });
};

// Wraps a handler so every deposit endpoint shares the same error response.
const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (error) {
    sendError(res, error);
  }
};

const parseCaseId = (req) => {
  const caseId = Number(req.params.caseId);
  if (!Number.isInteger(caseId) || caseId <= 0) {
    const error = new Error("Case ID must be a positive integer");
    error.statusCode = 400;
    error.error = "VALIDATION_ERROR";
    throw error;
  }
  return caseId;
};

// Get Enabled Bank Accounts
const getEnabledBankAccountsController = handle(async (req, res) => {
  const data = await getEnabledBankAccountsService();
  res.json({ success: true, data });
});

// Get Deposit Summary For Case
const getCaseDepositController = handle(async (req, res) => {
  const data = await getCaseDepositService(parseCaseId(req));
  res.json({ success: true, data });
});

// Get Payments For Case
const getPaymentsController = handle(async (req, res) => {
  const data = await getPaymentsService(parseCaseId(req));
  res.json({ success: true, data });
});

// Submit Initial Deposit
const submitDepositController = handle(async (req, res) => {
  const data = await submitDepositService(
    parseCaseId(req),
    req.body ?? {},
    req.user.userId,
  );
  res.status(201).json({ success: true, data });
});

// Review Deposit Shortfall
const reviewDepositController = handle(async (req, res) => {
  const data = await reviewDepositService(
    parseCaseId(req),
    req.body ?? {},
    req.user.userId,
  );
  res.json({ success: true, data });
});

module.exports = {
  getEnabledBankAccountsController,
  getCaseDepositController,
  getPaymentsController,
  submitDepositController,
  reviewDepositController,
};
