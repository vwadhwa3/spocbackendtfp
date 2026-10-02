const {
  createPrepareDocumentsTaskService,
  getAllPrepareDocumentsTasksService,
} = require("../../services/CSR/prepareDocuments.service");

// Create Prepare Documents Task
const createPrepareDocumentsTaskController = async (req, res) => {
  try {
    const result = await createPrepareDocumentsTaskService(req.body);

    return res.status(201).json({
      success: true,
      message: "Prepare Documents task created successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Create Prepare Documents Task Error:", error);

    if (
      error.message === "Case ID is required" ||
      error.message === "Application ID is required" ||
      error.message === "Assigned user ID is required" ||
      error.message === "Created by user ID is required" ||
      error.message === "Role required is required" ||
      error.message === "Application not found" ||
      error.message === "Case not found" ||
      error.message === "Assigned CSR user not found"
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

// Get All Prepare Documents Tasks
const getAllPrepareDocumentsTasksController = async (req, res) => {
  try {
    const result = await getAllPrepareDocumentsTasksService();

    return res.status(200).json({
      success: true,
      message: "Prepare Documents task list fetched successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Get All Prepare Documents Tasks Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

module.exports = {
  createPrepareDocumentsTaskController,
  getAllPrepareDocumentsTasksController,
};
