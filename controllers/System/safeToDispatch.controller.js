const {
  sendSafeToDispatchDocumentsService,
} = require("../../services/System/safeToDispatch.service");

const sendSafeToDispatchDocumentsController = async (req, res) => {
  try {
    const { application_id } = req.params;

    if (!application_id) {
      return res.status(400).json({
        success: false,
        message: "Application ID is required.",
      });
    }

    const result = await sendSafeToDispatchDocumentsService(application_id);

    return res.status(200).json({
      success: true,
      message:
        "Safe-to-dispatch documents sent successfully and application moved to Awaiting Balance Payment.",
      data: result,
    });
  } catch (error) {
    console.error("Send Safe-to-Dispatch Documents Error:", error);

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  sendSafeToDispatchDocumentsController,
};
