const express = require("express");

const router = express.Router();

const {
  createPrepareDocumentsTaskController,
  getAllPrepareDocumentsTasksController,
} = require("../../controllers/CSR/prepareDocuments.controller");

// Create Prepare Documents Task
router.post("/create", createPrepareDocumentsTaskController);

// Get All Prepare Documents Tasks
router.get("/view", getAllPrepareDocumentsTasksController);

module.exports = router;
