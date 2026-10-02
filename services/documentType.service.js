const { getPool } = require("../config/dataBase");

const getAllDocumentTypesService = async () => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  const result = await pool.query(`
    SELECT
      document_type_id,
      name,
      description,
      safe_to_dispatch_before_balance,
      visa_category_id,
      created_by_user_id,
      valid_from_date,
      valid_to_date,
      created_by,
      creation_timestamp,
      updated_by,
      updation_timestamp,
      document_category_id,
      discontinued_by,
      discontinued_at
    FROM document_type
    WHERE discontinued_at IS NULL
    ORDER BY document_type_id;
  `);

  return result.rows;
};

const createDocumentTypeService = async (documentTypeData) => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  const {
    name,
    description,
    safe_to_dispatch_before_balance,
    visa_category_id,
    created_by_user_id,
    document_category_id,
    created_by,
  } = documentTypeData;

  // --------------------------------------------------
  // 1. Required validations
  // --------------------------------------------------

  if (!name || !name.trim()) {
    throw new Error("name is required");
  }

  if (!created_by_user_id) {
    throw new Error("created_by_user_id is required");
  }

  if (!document_category_id) {
    throw new Error("document_category_id is required");
  }

  if (!created_by) {
    throw new Error("created_by is required");
  }

  // --------------------------------------------------
  // 2. Validate 0/1 field
  // --------------------------------------------------

  if (
    safe_to_dispatch_before_balance !== undefined &&
    ![0, 1].includes(Number(safe_to_dispatch_before_balance))
  ) {
    throw new Error("safe_to_dispatch_before_balance must be 0 or 1");
  }

  // --------------------------------------------------
  // 3. Check duplicate document type
  // --------------------------------------------------

  const existingResult = await pool.query(
    `
      SELECT document_type_id
      FROM document_type
      WHERE LOWER(name) = LOWER($1)
        AND discontinued_at IS NULL
      LIMIT 1;
    `,
    [name.trim()],
  );

  if (existingResult.rows.length > 0) {
    throw new Error("Document type already exists");
  }

  // --------------------------------------------------
  // 4. Create document type
  // --------------------------------------------------

  const result = await pool.query(
    `
      INSERT INTO document_type
      (
        name,
        description,
        safe_to_dispatch_before_balance,
        visa_category_id,
        created_by_user_id,
        document_category_id,
        created_by
      )
      VALUES
      (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7
      )
      RETURNING *;
    `,
    [
      name.trim(),
      description || null,
      safe_to_dispatch_before_balance === undefined
        ? 0
        : Number(safe_to_dispatch_before_balance),
      visa_category_id || null,
      created_by_user_id,
      document_category_id,
      String(created_by),
    ],
  );

  return result.rows[0];
};

module.exports = {
  getAllDocumentTypesService,
  createDocumentTypeService,
};
