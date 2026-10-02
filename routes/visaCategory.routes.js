const express = require("express");

const router = express.Router();

const {
  getAllVisaCategoriesController,
  createVisaCategoryController,
  updateVisaCategoryController,
  deleteVisaCategoryController,
} = require("../controllers/visaCategory.controller");

// Get All Visa Categories
router.get("/", getAllVisaCategoriesController);

// Create Visa Category
router.post("/", createVisaCategoryController);

// Update Visa Category
router.put("/:id", updateVisaCategoryController);

// Delete Visa Category
router.delete("/:id", deleteVisaCategoryController);

module.exports = router;
