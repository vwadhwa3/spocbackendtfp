const {
  updateApplicantSectionService,
  updateTravelInfoService,
  updatePreviousVisaService,
  uploadDocumentService,
  updateDocumentService,
  deleteDocumentService,
} = require("../services/applicantEdit.service");

const sendError = (res, error) => {
  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      error: error.error,
      message: error.message,
      ...(error.details && { details: error.details }),
    });
  }

  console.error("Applicant Edit Error:", error);
  return res.status(500).json({
    success: false,
    error: "INTERNAL_ERROR",
    message: "Something went wrong",
  });
};

// Wraps a handler so every edit endpoint shares the same error response.
const handle =
  (fn, status = 200) =>
  async (req, res) => {
    try {
      res.status(status).json({ success: true, data: await fn(req) });
    } catch (error) {
      sendError(res, error);
    }
  };

// Patch Applicant Section
const updateApplicantSectionController = (section) =>
  handle((req) =>
    updateApplicantSectionService(
      req.params.applicationId,
      section,
      req.body,
      req.user.userId,
    ),
  );

// Patch Travel Info
const updateTravelInfoController = handle((req) =>
  updateTravelInfoService(req.params.applicationId, req.body, req.user.userId),
);

// Patch Previous Visa
const updatePreviousVisaController = handle((req) =>
  updatePreviousVisaService(
    req.params.applicationId,
    req.body,
    req.user.userId,
  ),
);

// Upload Document
const uploadDocumentController = handle(
  (req) =>
    uploadDocumentService(
      req.params.applicationId,
      req.body,
      req.file,
      req.user.userId,
    ),
  201,
);

// Patch Document
const updateDocumentController = handle((req) =>
  updateDocumentService(
    req.params.documentKey,
    req.body,
    req.file,
    req.user.userId,
  ),
);

// Delete Document
const deleteDocumentController = handle((req) =>
  deleteDocumentService(req.params.documentKey, req.user.userId),
);

module.exports = {
  updateApplicantSectionController,
  updateTravelInfoController,
  updatePreviousVisaController,
  uploadDocumentController,
  updateDocumentController,
  deleteDocumentController,
};
