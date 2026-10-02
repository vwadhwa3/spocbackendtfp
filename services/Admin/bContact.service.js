const { getPool } = require("../../config/database");

const createContactService = async (data) => {
  const pool = getPool();

  const {
    case_id = null,
    role_id,
    first_name,
    surname,
    surname_at_birth,
    additional_name,
    had_different_name = false,
    previous_name,
    gender_id,
    date_of_birth,
    place_of_birth_id,
    country_of_birth,
    nationality,
    nationality_at_birth,
    marital_status_id,
    whatsapp_number,
    phone_number,
    travel_document_type,
    travel_document_number,
    issue_date,
    expiry_date,
    country_id,
    travel_document_file_path,
    email,
    created_by,
    updated_by,
  } = data;

  // Required field validation
  if (!role_id) {
    throw Object.assign(new Error("role_id is required"), {
      statusCode: 400,
    });
  }

  if (!first_name) {
    throw Object.assign(new Error("first_name is required"), {
      statusCode: 400,
    });
  }

  if (!gender_id) {
    throw Object.assign(new Error("gender_id is required"), {
      statusCode: 400,
    });
  }

  if (!date_of_birth) {
    throw Object.assign(new Error("date_of_birth is required"), {
      statusCode: 400,
    });
  }

  if (!place_of_birth_id) {
    throw Object.assign(new Error("place_of_birth_id is required"), {
      statusCode: 400,
    });
  }

  if (!nationality) {
    throw Object.assign(new Error("nationality is required"), {
      statusCode: 400,
    });
  }

  if (!marital_status_id) {
    throw Object.assign(new Error("marital_status_id is required"), {
      statusCode: 400,
    });
  }

  if (!travel_document_type) {
    throw Object.assign(new Error("travel_document_type is required"), {
      statusCode: 400,
    });
  }

  if (!travel_document_number) {
    throw Object.assign(new Error("travel_document_number is required"), {
      statusCode: 400,
    });
  }

  if (!issue_date) {
    throw Object.assign(new Error("issue_date is required"), {
      statusCode: 400,
    });
  }

  if (!expiry_date) {
    throw Object.assign(new Error("expiry_date is required"), {
      statusCode: 400,
    });
  }

  if (!country_id) {
    throw Object.assign(new Error("country_id is required"), {
      statusCode: 400,
    });
  }

  if (!created_by) {
    throw Object.assign(new Error("created_by is required"), {
      statusCode: 400,
    });
  }

  const query = `
    INSERT INTO b_contact (
      case_id,
      role_id,
      first_name,
      surname,
      surname_at_birth,
      additional_name,
      had_different_name,
      previous_name,
      gender_id,
      date_of_birth,
      place_of_birth_id,
      country_of_birth,
      nationality,
      nationality_at_birth,
      marital_status_id,
      whatsapp_number,
      phone_number,
      travel_document_type,
      travel_document_number,
      issue_date,
      expiry_date,
      country_id,
      travel_document_file_path,
      email,
      created_by,
      updated_by
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11, $12, $13, $14, $15, $16,
      $17, $18, $19, $20, $21, $22, $23, $24,
      $25, $26
    )
    RETURNING contact_id;
  `;

  const values = [
    case_id, // IMPORTANT: null allowed
    role_id,
    first_name,
    surname || null,
    surname_at_birth || null,
    additional_name || null,
    had_different_name,
    previous_name || null,
    gender_id,
    date_of_birth,
    place_of_birth_id,
    country_of_birth || null,
    nationality,
    nationality_at_birth || null,
    marital_status_id,
    whatsapp_number || null,
    phone_number || null,
    travel_document_type,
    travel_document_number,
    issue_date,
    expiry_date,
    country_id,
    travel_document_file_path || null,
    email || null,
    created_by,
    updated_by || created_by,
  ];

  const result = await pool.query(query, values);

  return result.rows[0];
};

module.exports = {
  createContactService,
};
