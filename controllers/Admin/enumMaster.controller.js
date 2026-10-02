const {
  createEnumMasterService,
  getAllEnumMasterService,
  getEnumMasterByIdService,
  updateEnumMasterService,
  deleteEnumMasterService,
} = require("../../services/Admin/enumMaster.service");

// Create Enum Master Controller
const createEnumMasterController = async (req, res) => {
  try {
    const result = await createEnumMasterService(req.body);

    return res.status(201).json({
      success: true,
      message: "Enum value created successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Create Enum Master Error:", error);

    if (
      error.message === "Enum type is required" ||
      error.message === "Enum type cannot exceed 100 characters" ||
      error.message === "Enum code is required" ||
      error.message === "Enum code cannot exceed 100 characters" ||
      error.message === "Label is required" ||
      error.message === "Label cannot exceed 200 characters" ||
      error.message === "Description cannot exceed 500 characters" ||
      error.message === "Display order must be a numeric value" ||
      error.message === "is_active must be either 0 or 1"
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message === "This value already exists for this enum type") {
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

// Get All Enum Master Controller
const getAllEnumMasterController = async (req, res) => {
  try {
    const result = await getAllEnumMasterService();

    return res.status(200).json({
      success: true,
      message: "Enum master list fetched successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Get All Enum Master Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// Get Enum Master By ID Controller
const getEnumMasterByIdController = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await getEnumMasterByIdService(id);

    return res.status(200).json({
      success: true,
      message: "Enum master fetched successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Get Enum Master By ID Error:", error);

    if (error.message === "Enum master not found") {
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

// Update Enum Master Controller
const updateEnumMasterController = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await updateEnumMasterService(id, req.body);

    return res.status(200).json({
      success: true,
      message: "Enum master updated successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Update Enum Master Error:", error);

    if (
      error.message === "Enum master not found" ||
      error.message === "Enum type cannot exceed 100 characters" ||
      error.message === "Enum code cannot exceed 100 characters" ||
      error.message === "Label is required" ||
      error.message === "Label cannot exceed 200 characters" ||
      error.message === "Description cannot exceed 500 characters" ||
      error.message === "Display order must be a numeric value" ||
      error.message === "is_active must be either 0 or 1"
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message === "This value already exists for this enum type") {
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

// Soft Delete Enum Master Controller
const deleteEnumMasterController = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await deleteEnumMasterService(id);

    return res.status(200).json({
      success: true,
      message: "Enum master deactivated successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Delete Enum Master Error:", error);

    if (error.message === "Enum master not found") {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (
      error.message ===
      "Enum master cannot be deactivated because it is already inactive"
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
  createEnumMasterController,
  getAllEnumMasterController,
  getEnumMasterByIdController,
  updateEnumMasterController,
  deleteEnumMasterController,
};
