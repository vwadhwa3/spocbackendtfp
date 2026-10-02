const {
  getAllDocumentCategoriesService,
  createDocumentCategoryService,
} = require("../services/documentCategory.service");

const getAllDocumentCategoriesController = async (req, res) => {
  try {
    const result = await getAllDocumentCategoriesService();

    return res.status(200).json({
      success: true,
      message: "Document category list fetched successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Get All Document Categories Controller Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

const createDocumentCategoryController = async (req, res) => {
  try {
    const result = await createDocumentCategoryService(req.body);

    return res.status(201).json({
      success: true,
      message: "Document category created successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Create Document Category Controller Error:", error);

    if (
      error.message === "name is required" ||
      error.message === "created_by is required"
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

module.exports = {
  getAllDocumentCategoriesController,
  createDocumentCategoryController,
};
