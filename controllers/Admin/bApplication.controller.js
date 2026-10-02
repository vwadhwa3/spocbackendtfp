const {
  submitAppointmentDetailsService,
  getAllApplicationsService,
  createAppointmentTaskService,
  createApplicationService,
} = require("../../services/Admin/bApplication.service");

// Submit Appointment Details(Appointment Monitoring Task)
const submitAppointmentDetailsController = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { user_id } = req.body;

    const result = await submitAppointmentDetailsService(
      applicationId,
      user_id,
      req.body,
    );

    return res.status(200).json({
      success: true,
      message: "Appointment details submitted successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Submit Appointment Details Error:", error);

    if (error.message === "User not found") {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (
      error.message === "Only Lead Consultant can submit appointment details"
    ) {
      return res.status(403).json({
        success: false,
        message: error.message,
      });
    }

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

// Create Appointment Monitoring Task
const createAppointmentTaskController = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { created_by_user_id } = req.body;

    const result = await createAppointmentTaskService(
      applicationId,
      created_by_user_id,
    );

    return res.status(201).json({
      success: true,
      message: "Appointment Monitoring task created successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Create Appointment Task Error:", error);

    if (
      error.message === "Application not found" ||
      error.message === "Lead Consultant not found" ||
      error.message === "Appointment Monitoring task type not found"
    ) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (
      error.message ===
        "Appointment task cannot be created for this application" ||
      error.message === "Appointment Monitoring task already exists"
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

// Get All Applications
const getAllApplicationsController = async (req, res) => {
  try {
    const result = await getAllApplicationsService();

    return res.status(200).json({
      success: true,
      message: "Application list fetched successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Get All Applications Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// Create Application
const createApplicationController = async (req, res) => {
  try {
    const result = await createApplicationService(req.body);

    return res.status(201).json({
      success: true,
      message: "Application created successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Create Application Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

module.exports = {
  submitAppointmentDetailsController,
  getAllApplicationsController,
  createAppointmentTaskController,
  createApplicationController,
};
