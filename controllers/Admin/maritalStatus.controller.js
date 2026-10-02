const {
  createMaritalStatusService,
  getAllMaritalStatusService,
  getMaritalStatusByIdService,
  updateMaritalStatusService,
  deleteMaritalStatusService,
} = require("../../services/Admin/maritalStatus.service");

// Create Marital Status
const createMaritalStatusController = async (req, res) => {
  try {
    const { code, label, created_by } = req.body;

    // Required validation
    if (!code || !label || !created_by) {
      return res.status(400).json({
        success: false,
        message: "code, label and created_by are required",
      });
    }

    // Max length validation
    if (code.length > 20) {
      return res.status(400).json({
        success: false,
        message: "code must not exceed 20 characters",
      });
    }

    if (label.length > 50) {
      return res.status(400).json({
        success: false,
        message: "label must not exceed 50 characters",
      });
    }

    const data = await createMaritalStatusService(req.body);

    return res.status(201).json({
      success: true,
      message: "Marital status created successfully",
      data,
    });
  } catch (error) {
    console.error("Create Marital Status Error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

// Get All Marital Statuses
const getAllMaritalStatusController = async (req, res) => {
  try {
    const data = await getAllMaritalStatusService();

    return res.status(200).json({
      success: true,
      message: "Marital statuses fetched successfully",
      data,
    });
  } catch (error) {
    console.error("Get All Marital Status Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

// Get Marital Status By ID
const getMaritalStatusByIdController = async (req, res) => {
  try {
    const { id } = req.params;

    const data = await getMaritalStatusByIdService(id);

    return res.status(200).json({
      success: true,
      message: "Marital status fetched successfully",
      data,
    });
  } catch (error) {
    console.error("Get Marital Status By ID Error:", error);

    return res.status(404).json({
      success: false,
      message: error.message || "Marital status not found",
    });
  }
};

// Update Marital Status
const updateMaritalStatusController = async (req, res) => {
  try {
    const { id } = req.params;

    const data = await updateMaritalStatusService(id, req.body);

    return res.status(200).json({
      success: true,
      message: "Marital status updated successfully",
      data,
    });
  } catch (error) {
    console.error("Update Marital Status Error:", error);

    return res
      .status(error.message === "Marital status not found" ? 404 : 400)
      .json({
        success: false,
        message: error.message || "Internal server error",
      });
  }
};

// Delete Marital Status
const deleteMaritalStatusController = async (req, res) => {
  try {
    const { id } = req.params;

    const data = await deleteMaritalStatusService(id);

    return res.status(200).json({
      success: true,
      message: "Marital status deleted successfully",
      data,
    });
  } catch (error) {
    console.error("Delete Marital Status Error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

module.exports = {
  createMaritalStatusController,
  getAllMaritalStatusController,
  getMaritalStatusByIdController,
  updateMaritalStatusController,
  deleteMaritalStatusController,
};
