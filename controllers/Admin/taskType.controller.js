const {
  getAllTaskTypesService,
  createTaskService,
  getTasksByUserService,
} = require("../../services/Admin/taskType.service");

// Get All Task Types
const getAllTaskTypesController = async (req, res) => {
  try {
    const result = await getAllTaskTypesService();

    return res.status(200).json({
      success: true,
      message: "Task type list fetched successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Get All Task Types Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// Create Task
const createTaskController = async (req, res) => {
  try {
    const result = await createTaskService(req.body);

    return res.status(201).json({
      success: true,
      message: "Task created successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Create Task Error:", error);

    if (error.message === "Application not found") {
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

// Get Tasks By User
const getTasksByUserController = async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await getTasksByUserService(userId);

    return res.status(200).json({
      success: true,
      message: "User tasks fetched successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Get Tasks By User Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

module.exports = {
  getAllTaskTypesController,
  getTasksByUserController,
  createTaskController,
};
