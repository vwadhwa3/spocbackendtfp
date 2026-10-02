const {
  getAllDocumentTypesService,
  createDocumentTypeService,
} = require("../services/documentType.service.js");

const getAllDocumentTypesController = async (req, res) => {
  try {
    const result = await getAllDocumentTypesService();

    return res.status(200).json({
      success: true,
      message: "Document type list fetched successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Get All Document Types Controller Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

const createDocumentTypeController = async (req, res) => {
  try {
    const result = await createDocumentTypeService(req.body);

    return res.status(201).json({
      success: true,
      message: "Document type created successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Create Document Type Controller Error:", error);

    if (
      error.message === "name is required" ||
      error.message === "created_by_user_id is required" ||
      error.message === "document_category_id is required" ||
      error.message === "created_by is required" ||
      error.message === "safe_to_dispatch_before_balance must be 0 or 1"
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message === "Document type already exists") {
      return res.status(409).json({
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
  getAllDocumentTypesController,
  createDocumentTypeController,
};
