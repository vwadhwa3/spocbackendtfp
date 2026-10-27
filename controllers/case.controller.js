const {
  createFullCaseService,
  getMinimumDepositService,
  listCasesService,
  listMyCasesService,
  getMyCaseService,
  getCustomerService,
  getDocumentLinkService,
} = require("../services/case.service");

const sendError = (res, error) => {
  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      error: error.error,
      message: error.message,
      ...(error.details && { details: error.details }),
    });
  }

  console.error("Case Error:", error);
  return res.status(500).json({
    success: false,
    error: "INTERNAL_ERROR",
    message: "Something went wrong",
  });
};

// Wraps a handler so every case endpoint shares the same error response.
const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (error) {
    sendError(res, error);
  }
};

// The wizard's answers arrive as JSON in the multipart `data` field, next to
// the travel document files.
const parseData = (req) => {
  try {
    const data = JSON.parse(req.body?.data ?? "");
    if (data && typeof data === "object" && !Array.isArray(data)) return data;
  } catch {
    // reported below
  }

  const error = new Error("Field `data` must be a JSON object");
  error.statusCode = 400;
  error.error = "VALIDATION_ERROR";
  throw error;
};

// List Cases
const listCasesController = handle(async (req, res) => {
  const data = await listCasesService();
  res.json({ success: true, data });
});

// List My Cases
const listMyCasesController = handle(async (req, res) => {
  const data = await listMyCasesService(req.query, req.user.userId);
  res.json({
    success: true,
    ...(data.pagination.total === 0 && { message: "No cases found" }),
    data,
  });
});

// Get My Case
const getMyCaseController = handle(async (req, res) => {
  const data = await getMyCaseService(req.params.caseId, req.user.userId);
  res.json({ success: true, data });
});

// Get Customer
const getCustomerController = handle(async (req, res) => {
  const data = await getCustomerService(req.params.contactId);
  res.json({ success: true, data });
});

// Get Document Link
const getDocumentLinkController = handle(async (req, res) => {
  const data = await getDocumentLinkService(req.params.documentKey, {
    download: req.query.download === "1",
  });
  res.json({ success: true, data });
});

// Get Minimum Deposit
const getMinimumDepositController = handle(async (req, res) => {
  const data = await getMinimumDepositService(req.query);
  res.json({ success: true, data });
});

// Create Full Case
const createFullCaseController = handle(async (req, res) => {
  const data = await createFullCaseService(
    parseData(req),
    req.files ?? [],
    req.user.userId,
  );
  res.status(201).json({ success: true, data });
});

module.exports = {
  listCasesController,
  listMyCasesController,
  getMyCaseController,
  getCustomerController,
  getDocumentLinkController,
  getMinimumDepositController,
  createFullCaseController,
};
