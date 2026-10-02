const {
  saveVisaHistoryService,
  getVisaHistoryService,
  getAllVisaHistoryService,
} = require("../services/visaHistory.service");

// SAVE / UPDATE VISA HISTORY DETAILS
const saveVisaHistoryController = async (req, res) => {
  try {
    const result = await saveVisaHistoryService(req.body);

    return res.status(200).json(result);
  } catch (err) {
    console.error("[POST /visa-history/save] Error:", err.message);

    return res.status(err.status || 500).json({
      success: false,
      error: err.message || "Failed to save visa history details",
      ...(err.field && { field: err.field }),
      ...(err.validationErrors && { validationErrors: err.validationErrors }),
    });
  }
};

// GET VISA HISTORY DETAILS FOR A FORM
const getVisaHistoryController = async (req, res) => {
  try {
    const result = await getVisaHistoryService(req.params.form_id);

    return res.status(200).json(result);
  } catch (err) {
    console.error("[GET /visa-history/:form_id] Error:", err.message);

    return res.status(err.status || 500).json({
      success: false,
      error: err.message || "Failed to fetch visa history details",
      ...(err.field && { field: err.field }),
    });
  }
};

// GET ALL VISA HISTORY
const getAllVisaHistoryController = async (req, res) => {
  try {
    const result = await getAllVisaHistoryService();

    return res.status(200).json(result);
  } catch (err) {
    console.error("[GET /visa-history] Error:", err.message);

    return res.status(err.status || 500).json({
      success: false,
      error: err.message || "Failed to fetch visa history details",
    });
  }
};

module.exports = {
  saveVisaHistoryController,
  getVisaHistoryController,
  getAllVisaHistoryController,
};
