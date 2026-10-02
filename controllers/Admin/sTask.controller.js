const { createSTaskService } = require("../../services/Admin/sTask.service");

// Create S_TASK Controller
const createSTaskController = async (req, res) => {
  try {
    const result = await createSTaskService(req.body);

    return res.status(201).json({
      success: true,
      message: "Task type created successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Create S_TASK Error:", error);

    if (
      error.message === "Task type code is required" ||
      error.message === "Label is required" ||
      error.message === "is_active must be either 0 or 1"
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message === "Task type code already exists") {
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

module.exports = {
  createSTaskController,
};
