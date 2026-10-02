const {
  uploadDocumentService,
} = require("../../services/System/documentUpload.service");

const uploadDocumentController = async (req, res) => {
  try {
    const { application_id, case_id, document_type_id, uploaded_by_user_id } =
      req.body;

    if (!application_id || !case_id || !document_type_id) {
      return res.status(400).json({
        success: false,
        message: "application_id, case_id and document_type_id are required.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Document file is required.",
      });
    }

    const result = await uploadDocumentService({
      application_id,
      case_id,
      document_type_id,
      uploaded_by_user_id,
      file: req.file,
    });

    return res.status(201).json({
      success: true,
      message: "Document uploaded successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Document Upload Error:", error);

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  uploadDocumentController,
};
