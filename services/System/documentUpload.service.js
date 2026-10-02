const { getPool } = require("../../config/database");

const uploadDocumentService = async ({
  application_id,
  case_id,
  document_type_id,
  uploaded_by_user_id,
  file,
}) => {
  const pool = getPool();

  const result = await pool.query(
    `
    INSERT INTO attachment (
      case_id,
      application_id,
      document_type_id,
      file_name,
      file_path,
      uploaded_by_customer,
      uploaded_by_user_id,
      created_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING
      attachment_id,
      case_id,
      application_id,
      document_type_id,
      file_name,
      file_path,
      uploaded_by_customer,
      uploaded_by_user_id,
      uploaded_at,
      created_by,
      creation_timestamp
    `,
    [
      case_id,
      application_id,
      document_type_id,
      file.originalname,
      file.path,
      0,
      uploaded_by_user_id || null,
      "system",
    ],
  );

  return result.rows[0];
};

module.exports = {
  uploadDocumentService,
};
