const { saveVisaHistory, getVisaHistory, getAllVisaHistory } = require("../services/visaHistoryService");

// SAVE / UPDATE VISA HISTORY DETAILS
const saveVisaHistoryDoc = async (req, res) => {
  try {
    const result = await saveVisaHistory(req.body);

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
const getVisaHistoryDoc = async (req, res) => {
  try {
    const result = await getVisaHistory(req.params.form_id);

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
const getAllVisaHistoryDocs = async (req, res) => {
  try {
    const result = await getAllVisaHistory();

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
  saveVisaHistoryDoc,
  getVisaHistoryDoc,
  getAllVisaHistoryDocs,
};