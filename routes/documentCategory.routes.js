const express = require("express");
const router = express.Router();

const {
  getAllDocumentCategoriesController,
  createDocumentCategoryController,
} = require("../controllers/documentCategory.controller");

router.get("/view", getAllDocumentCategoriesController);

router.post("/create", createDocumentCategoryController);

module.exports = router;
