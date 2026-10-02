const {
  createAppStatusService,
  getAllAppStatusService,
  getAppStatusByIdService,
  updateAppStatusService,
  deleteAppStatusService,
} = require("../../services/Admin/appStatus.service");

// Create Application Status Controller
const createAppStatusController = async (req, res) => {
  try {
    const result = await createAppStatusService(req.body);

    return res.status(201).json({
      success: true,
      message: "Application status created successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Create Application Status Error:", error);

    if (
      error.message === "Status code is required" ||
      error.message === "Status code cannot exceed 50 characters" ||
      error.message === "Label is required" ||
      error.message === "Label cannot exceed 100 characters" ||
      error.message === "is_terminal must be either 0 or 1" ||
      error.message === "is_active must be either 0 or 1" ||
      error.message === "Display order must be a numeric value" ||
      error.message.startsWith("Invalid next status ID:") ||
      error.message.startsWith("Next status ID")
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message === "Application status already exists") {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// Get All Application Statuses Controller
const getAllAppStatusController = async (req, res) => {
  try {
    const result = await getAllAppStatusService();

    return res.status(200).json({
      success: true,
      message: "Application status list fetched successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Get All Application Status Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// Get Application Status By ID Controller
const getAppStatusByIdController = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await getAppStatusByIdService(id);

    return res.status(200).json({
      success: true,
      message: "Application status fetched successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Get Application Status By ID Error:", error);

    if (error.message === "Application status not found") {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// Update Application Status Controller
const updateAppStatusController = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await updateAppStatusService(id, req.body);

    return res.status(200).json({
      success: true,
      message: "Application status updated successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Update Application Status Error:", error);

    if (
      error.message === "Application status not found" ||
      error.message === "Status code cannot be changed" ||
      error.message === "Status code cannot exceed 50 characters" ||
      error.message === "Label is required" ||
      error.message === "Label cannot exceed 100 characters" ||
      error.message === "is_terminal must be either 0 or 1" ||
      error.message === "is_active must be either 0 or 1" ||
      error.message === "Display order must be a numeric value" ||
      error.message.startsWith("Invalid next status ID:") ||
      error.message.startsWith("Next status ID")
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// Soft Delete Application Status
const deleteAppStatusController = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await deleteAppStatusService(id);

    return res.status(200).json({
      success: true,
      message: "Application status deactivated successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Delete Application Status Error:", error);

    if (error.message === "Application status not found") {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (
      error.message ===
      "Application status cannot be deactivated because it is already inactive"
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

module.exports = {
  createAppStatusController,
  getAllAppStatusController,
  getAppStatusByIdController,
  updateAppStatusController,
  deleteAppStatusController,
};
