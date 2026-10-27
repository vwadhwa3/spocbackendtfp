const express = require("express");
const multer = require("multer");

const router = express.Router();

const { authenticate } = require("../middleware/auth.middleware");
const { ROLES, requireRole } = require("../middleware/role.middleware");
const {
  listCasesController,
  listMyCasesController,
  getMyCaseController,
  getCustomerController,
  getDocumentLinkController,
  getMinimumDepositController,
  createFullCaseController,
} = require("../controllers/case.controller");
const { MAX_APPLICANTS, MAX_FILE_BYTES } = require("../services/case.service");

// Add New Case is SPOC-only, enforced here and not just hidden in the UI.
const spocOnly = [authenticate, requireRole(ROLES.SPOC)];

// Files stay in memory until every check passes, so a rejected submission
// never reaches storage.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_APPLICANTS, fields: 1 },
}).any();

const UPLOAD_ERROR_MESSAGES = {
  LIMIT_FILE_SIZE: "Travel document must be at most 10MB",
  LIMIT_FILE_COUNT: `At most ${MAX_APPLICANTS} travel documents per case`,
  LIMIT_FIELD_COUNT:
    "Only the `data` field and travel document files are allowed",
};

// Multer errors become the same 400 shape as the other validation errors.
const parseUpload = (req, res, next) =>
  upload(req, res, (error) => {
    if (!error) return next();
    if (!(error instanceof multer.MulterError)) return next(error);

    res.status(400).json({
      success: false,
      error: "VALIDATION_ERROR",
      message: UPLOAD_ERROR_MESSAGES[error.code] ?? error.message,
    });
  });

// List Cases
router.get("/list", spocOnly, listCasesController);

// List My Cases: ?name=&whatsapp=&status=&page=
router.get("/my-cases", spocOnly, listMyCasesController);

// Get My Case: one of the SPOC's own cases, read-only
router.get("/my-cases/:caseId", spocOnly, getMyCaseController);

// Get Customer
router.get("/customer/:contactId", spocOnly, getCustomerController);

// Get Document Link
router.get("/document/:documentKey", spocOnly, getDocumentLinkController);

// Get Minimum Deposit
router.get("/minimum-deposit", spocOnly, getMinimumDepositController);

// Create Full Case
router.post("/create-full", spocOnly, parseUpload, createFullCaseController);

module.exports = router;
