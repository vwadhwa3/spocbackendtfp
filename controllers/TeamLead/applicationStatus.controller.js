const {
  updateApplicationStatusToCustomerReviewService,
} = require("../../services/TeamLead/applicationStatus.service");

// Team Lead → Documents in Customer Review
const updateApplicationStatusToCustomerReviewController = async (req, res) => {
  try {
    const { application_id } = req.params;

    const result = await updateApplicationStatusToCustomerReviewService(
      application_id,
      req.body,
    );

    return res.status(200).json({
      success: true,
      message:
        "Application moved to Documents in Customer Review successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Update Application Status To Customer Review Error:", error);

    if (
      error.message === "Application not found" ||
      error.message === "Team Lead user not found" ||
      error.message === "Documents in Customer Review status not found"
    ) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (
      error.message ===
        "Only Team Lead users can move the application to Documents in Customer Review" ||
      error.message === "Application must be in Documents in TL Review status"
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
  updateApplicationStatusToCustomerReviewController,
};
