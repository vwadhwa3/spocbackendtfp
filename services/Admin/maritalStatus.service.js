const { getPool } = require("../../config/database");

// Create Marital Status
const createMaritalStatusService = async (body) => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  const { code, label, created_by } = body;

  // Code required
  if (!code || !code.trim()) {
    throw new Error("Code is required");
  }

  // Code max 20 characters
  if (code.trim().length > 20) {
    throw new Error("Code cannot exceed 20 characters");
  }

  // Label required
  if (!label || !label.trim()) {
    throw new Error("Label is required");
  }

  // Label max 50 characters
  if (label.trim().length > 50) {
    throw new Error("Label cannot exceed 50 characters");
  }

  // Check duplicate code
  const duplicate = await pool.query(
    `
      SELECT marital_status_id
      FROM marital_status
      WHERE LOWER(code) = LOWER($1);
    `,
    [code.trim()],
  );

  if (duplicate.rows.length > 0) {
    throw new Error("This marital status already exists");
  }

  // Insert Marital Status
  const result = await pool.query(
    `
      INSERT INTO marital_status
      (
        code,
        label,
        created_by
      )
      VALUES
      (
        $1,
        $2,
        $3
      )
      RETURNING *;
    `,
    [code.trim(), label.trim(), created_by],
  );

  const createdMaritalStatus = result.rows[0];

  // SYSTEM_LOG - CREATE
  await pool.query(
    `
      INSERT INTO system_log
      (
        event_timestamp,
        performed_by,
        table_name,
        record_id,
        action_type,
        old_state,
        new_state
      )
      VALUES
      (
        CURRENT_TIMESTAMP,
        $1,
        'MARITAL_STATUS',
        $2,
        'CREATE',
        $3,
        $4
      );
    `,
    [
      created_by,
      createdMaritalStatus.marital_status_id,
      null,
      createdMaritalStatus.label,
    ],
  );

  return createdMaritalStatus;
};

// Get All Marital Statuses
const getAllMaritalStatusService = async () => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  const result = await pool.query(`
    SELECT
      marital_status_id,
      code,
      label,
      created_by,
      creation_timestamp,
      updated_by,
      updation_timestamp
    FROM marital_status
    ORDER BY marital_status_id ASC;
  `);

  return result.rows;
};

// Get Marital Status By ID
const getMaritalStatusByIdService = async (id) => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  const result = await pool.query(
    `
      SELECT
        marital_status_id,
        code,
        label,
        created_by,
        creation_timestamp,
        updated_by,
        updation_timestamp
      FROM marital_status
      WHERE marital_status_id = $1;
    `,
    [id],
  );

  if (result.rows.length === 0) {
    throw new Error("Marital status not found");
  }

  return result.rows[0];
};

// Update Marital Status
const updateMaritalStatusService = async (id, body) => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  const { code, label, updated_by } = body;

  // Check if marital status exists
  const existing = await pool.query(
    `
      SELECT *
      FROM marital_status
      WHERE marital_status_id = $1;
    `,
    [id],
  );

  if (existing.rows.length === 0) {
    throw new Error("Marital status not found");
  }

  const oldMaritalStatus = existing.rows[0];

  // Code validation
  if (code !== undefined) {
    if (!code || !code.trim()) {
      throw new Error("Code is required");
    }

    if (code.trim().length > 20) {
      throw new Error("Code cannot exceed 20 characters");
    }
  }

  // Label validation
  if (label !== undefined) {
    if (!label || !label.trim()) {
      throw new Error("Label is required");
    }

    if (label.trim().length > 50) {
      throw new Error("Label cannot exceed 50 characters");
    }
  }

  // Final values
  const finalCode = code !== undefined ? code.trim() : oldMaritalStatus.code;

  const finalLabel =
    label !== undefined ? label.trim() : oldMaritalStatus.label;

  // Check duplicate code
  const duplicate = await pool.query(
    `
      SELECT marital_status_id
      FROM marital_status
      WHERE LOWER(code) = LOWER($1)
        AND marital_status_id <> $2;
    `,
    [finalCode, id],
  );

  if (duplicate.rows.length > 0) {
    throw new Error("This marital status already exists");
  }

  // Update Marital Status
  const result = await pool.query(
    `
      UPDATE marital_status
      SET
        code = $1,
        label = $2,
        updated_by = $3,
        updation_timestamp = CURRENT_TIMESTAMP
      WHERE marital_status_id = $4
      RETURNING *;
    `,
    [finalCode, finalLabel, updated_by, id],
  );

  const updatedMaritalStatus = result.rows[0];

  // SYSTEM_LOG - UPDATE
  await pool.query(
    `
      INSERT INTO system_log
      (
        event_timestamp,
        performed_by,
        table_name,
        record_id,
        action_type,
        old_state,
        new_state
      )
      VALUES
      (
        CURRENT_TIMESTAMP,
        $1,
        'MARITAL_STATUS',
        $2,
        'UPDATE',
        $3,
        $4
      );
    `,
    [
      updated_by,
      Number(id),
      oldMaritalStatus.label,
      updatedMaritalStatus.label,
    ],
  );

  return updatedMaritalStatus;
};

// Delete Marital Status
const deleteMaritalStatusService = async (id) => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  // Check if marital status exists
  const existing = await pool.query(
    `
      SELECT *
      FROM marital_status
      WHERE marital_status_id = $1;
    `,
    [id],
  );

  if (existing.rows.length === 0) {
    throw new Error("Marital status not found");
  }

  try {
    const result = await pool.query(
      `
        DELETE FROM marital_status
        WHERE marital_status_id = $1
        RETURNING *;
      `,
      [id],
    );

    return result.rows[0];
  } catch (error) {
    // Foreign key violation
    if (error.code === "23503") {
      const fkError = new Error(
        "This marital status is currently in use and cannot be deleted",
      );
      fkError.statusCode = 400;
      throw fkError;
    }

    throw error;
  }
};

module.exports = {
  createMaritalStatusService,
  getAllMaritalStatusService,
  getMaritalStatusByIdService,
  updateMaritalStatusService,
  deleteMaritalStatusService,
};
