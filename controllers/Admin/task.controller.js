const {
  createTaskService,
  getAllTasksService,
  getTaskByIdService,
  updateTaskService,
} = require("../../services/Admin/task.service");

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

// View All Tasks
const getAllTasksController = async (req, res) => {
  try {
    const result = await getAllTasksService();

    return res.status(200).json({
      success: true,
      message: "Task list fetched successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Get All Tasks Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// Get Task by Id
const getTaskByIdController = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await getTaskByIdService(id);

    return res.status(200).json({
      success: true,
      message: "Task fetched successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Get Task By ID Error:", error);

    if (error.message === "Task not found") {
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

// Update Task
const updateTaskController = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await updateTaskService(id, req.body);

    return res.status(200).json({
      success: true,
      message: "Task updated successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Update Task Error:", error);

    if (error.message === "Task not found") {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (
      error.message === "Invalid task status" ||
      error.message === "Decision is required when completing a task"
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
  createTaskController,
  getAllTasksController,
  getTaskByIdController,
  updateTaskController,
};
