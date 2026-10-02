const {
  saveTravelInfoService,
  getTravelInfoService,
  getAllTravelInfoService,
} = require("../services/travelInfo.service");

// SAVE / UPDATE TRAVEL INFO
const saveTravelInfoController = async (req, res) => {
  try {
    const result = await saveTravelInfoService(req.body);

    return res.status(200).json(result);
  } catch (err) {
    console.error("[POST /travel-info/save] Error:", err.message);

    return res.status(err.status || 500).json({
      success: false,
      error: err.message || "Failed to save travel information",
      ...(err.field && { field: err.field }),
      ...(err.validationErrors && { validationErrors: err.validationErrors }),
    });
  }
};

// GET TRAVEL INFO FOR A FORM
const getTravelInfoController = async (req, res) => {
  try {
    const result = await getTravelInfoService(req.params.form_id);

    return res.status(200).json(result);
  } catch (err) {
    console.error("[GET /travel-info/:form_id] Error:", err.message);

    return res.status(err.status || 500).json({
      success: false,
      error: err.message || "Failed to fetch travel information",
      ...(err.field && { field: err.field }),
    });
  }
};

// GET ALL TRAVEL INFO
const getAllTravelInfoController = async (req, res) => {
  try {
    const result = await getAllTravelInfoService();

    return res.status(200).json(result);
  } catch (err) {
    console.error("[GET /travel-info] Error:", err.message);

    return res.status(err.status || 500).json({
      success: false,
      error: err.message || "Failed to fetch travel information",
    });
  }
};

module.exports = {
  saveTravelInfoController,
  getTravelInfoController,
  getAllTravelInfoController,
};
