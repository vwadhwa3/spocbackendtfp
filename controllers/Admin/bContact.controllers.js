const {
  createContactService,
} = require("../../services/Admin/bContact.service.js");

const createContactController = async (req, res) => {
  try {
    const contact = await createContactService(req.body);

    return res.status(201).json({
      success: true,
      message: "Contact created successfully",
      data: contact,
    });
  } catch (error) {
    console.error("Create Contact Controller Error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to create contact",
    });
  }
};

module.exports = {
  createContactController,
};
