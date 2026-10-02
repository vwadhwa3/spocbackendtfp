const express = require("express");
const router = express.Router();

const {
  getAllDocumentTypesController,
  createDocumentTypeController,
} = require("../controllers/documentType.controller.js");

router.get("/view", getAllDocumentTypesController);

router.post("/create", createDocumentTypeController);

module.exports = router;
