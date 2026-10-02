const {
  updateApplicationStatusService,
  updateApplicationInformationReviewService,
} = require("../../services/CSR/applicationStatus.service");

// CSR → Documents in TL Review
const updateApplicationStatusController = async (req, res) => {
  try {
    const { application_id } = req.params;

    const result = await updateApplicationStatusService(
      application_id,
      req.body,
    );

    return res.status(200).json({
      success: true,
      message: "Application moved to Documents in TL Review successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Update Application Status Error:", error);

    if (
      error.message === "Application not found" ||
      error.message === "CSR user not found" ||
      error.message === "Documents in TL Review status not found"
    ) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (
      error.message === "Application must be in Appointment Booked status" ||
      error.message ===
        "Only CSR users can move the application to Documents in TL Review"
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

// CSR → Application Information For Review
const updateApplicationInformationReviewController = async (req, res) => {
  try {
    const { application_id } = req.params;

    const result = await updateApplicationInformationReviewService(
      application_id,
      req.body,
    );

    return res.status(200).json({
      success: true,
      message:
        "Application moved to Application Information For Review successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Update Application Information For Review Error:", error);

    if (
      error.message === "Application not found" ||
      error.message === "CSR user not found" ||
      error.message === "Application Information For Review status not found"
    ) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (
      error.message ===
      "Only CSR users can move the application to Application Information For Review"
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
  updateApplicationStatusController,
  updateApplicationInformationReviewController,
};
