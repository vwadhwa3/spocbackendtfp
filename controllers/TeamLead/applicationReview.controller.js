const {
  createApplicationReviewTaskService,
  reviewApplicationService,
  getApplicationChecklistService,
  generateApplicationChecklistService,
  sendApplicationChecklistService,
} = require("../../services/TeamLead/applicationReview.service");

// Team Lead Review Application Information Task
const createApplicationReviewTaskController = async (req, res) => {
  try {
    const { application_id } = req.params;

    const result = await createApplicationReviewTaskService(
      application_id,
      req.body,
    );

    return res.status(201).json({
      success: true,
      message: "Review Application Information task created successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Create Review Application Information Task Error:", error);

    if (
      error.message === "Application not found" ||
      error.message === "Team Lead user not found" ||
      error.message === "Review Application Information task type not found"
    ) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (
      error.message ===
      "Application must be in Application Information For Review status"
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (
      error.message === "Review Application Information task already exists"
    ) {
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

// Team Lead: Review Application Information
const reviewApplicationController = async (req, res) => {
  try {
    const { application_id } = req.params;

    const result = await reviewApplicationService(application_id, req.body);

    return res.status(200).json({
      success: true,
      message: "Application information reviewed successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Review Application Controller Error:", error);

    if (
      error.message === "Application not found" ||
      error.message === "Team Lead user not found" ||
      error.message === "Review Application Information task not found"
    ) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (
      error.message ===
      "Application must be in Application Information For Review status"
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message === "Only Team Lead can review application information") {
      return res.status(403).json({
        success: false,
        message: error.message,
      });
    }

    if (
      error.message === "risk_assessment_flag must be 0 or 1" ||
      error.message === "vac_account_required must be 0 or 1" ||
      error.message === "updated_by is required"
    ) {
      return res.status(400).json({
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

//Team Lead: View Document Checklist
const getApplicationChecklistController = async (req, res) => {
  try {
    const { application_id } = req.params;

    const result = await getApplicationChecklistService(application_id);

    return res.status(200).json({
      success: true,
      message: "Application checklist fetched successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Get Application Checklist Controller Error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Internal server error.",
    });
  }
};

// Team Lead: Generate / Save Document Checklist
const generateApplicationChecklistController = async (req, res) => {
  try {
    const { application_id } = req.params;

    const result = await generateApplicationChecklistService(
      application_id,
      req.body,
    );

    return res.status(201).json({
      success: true,
      message: "Application document checklist generated successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Generate Application Checklist Controller Error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Internal server error.",
    });
  }
};

// Team Lead: Send Document Checklist to Customer
const sendApplicationChecklistController = async (req, res) => {
  try {
    const { application_id } = req.params;

    const result = await sendApplicationChecklistService(
      application_id,
      req.body,
    );

    return res.status(200).json({
      success: true,
      message: "Application document checklist sent successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Send Application Checklist Controller Error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Internal server error.",
    });
  }
};

module.exports = {
  createApplicationReviewTaskController,
  reviewApplicationController,
  getApplicationChecklistController,
  generateApplicationChecklistController,
  sendApplicationChecklistController,
};
