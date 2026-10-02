const {
  getAllVisaCategoriesService,
  createVisaCategoryService,
  updateVisaCategoryService,
  deleteVisaCategoryService,
} = require("../services/visaCategory.service");

// Routes are not authenticated yet, so req.user is normally absent.
const getActor = (req) => req.user?.username || "admin_user";

const sendError = (res, error) => {
  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  console.error("Visa Category Error:", error);
  return res.status(500).json({
    success: false,
    message: "Internal server error.",
  });
};

// Get All Visa Categories
const getAllVisaCategoriesController = async (req, res) => {
  try {
    const result = await getAllVisaCategoriesService();

    return res.status(200).json({
      success: true,
      count: result.length,
      data: result,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

// Create Visa Category
const createVisaCategoryController = async (req, res) => {
  try {
    const result = await createVisaCategoryService(req.body, getActor(req));

    return res.status(201).json({
      success: true,
      message: "Visa category created successfully.",
      data: result,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

// Update Visa Category
const updateVisaCategoryController = async (req, res) => {
  try {
    const result = await updateVisaCategoryService(
      req.params.id,
      req.body,
      getActor(req),
    );

    return res.status(200).json({
      success: true,
      message: "Visa category updated successfully.",
      data: result,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

// Delete Visa Category
const deleteVisaCategoryController = async (req, res) => {
  try {
    await deleteVisaCategoryService(req.params.id, getActor(req));

    return res.status(200).json({
      success: true,
      message: "Visa category deleted successfully.",
    });
  } catch (error) {
    return sendError(res, error);
  }
};

module.exports = {
  getAllVisaCategoriesController,
  createVisaCategoryController,
  updateVisaCategoryController,
  deleteVisaCategoryController,
};
