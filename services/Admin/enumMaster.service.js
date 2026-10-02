const { getPool } = require("../../config/database");

// Create Enum Master
const createEnumMasterService = async (body) => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  const {
    enum_type,
    enum_code,
    label,
    description,
    display_order,
    is_active,
    valid_from_date,
    valid_to_date,
    created_by,
  } = body;

  // Enum type required
  if (!enum_type || !enum_type.trim()) {
    throw new Error("Enum type is required");
  }

  // Enum type max 100 characters
  if (enum_type.trim().length > 100) {
    throw new Error("Enum type cannot exceed 100 characters");
  }

  // Enum code required
  if (!enum_code || !enum_code.trim()) {
    throw new Error("Enum code is required");
  }

  // Enum code max 100 characters
  if (enum_code.trim().length > 100) {
    throw new Error("Enum code cannot exceed 100 characters");
  }

  // Label required
  if (!label || !label.trim()) {
    throw new Error("Label is required");
  }

  // Label max 200 characters
  if (label.trim().length > 200) {
    throw new Error("Label cannot exceed 200 characters");
  }

  // Description max 500 characters
  if (
    description !== undefined &&
    description !== null &&
    description.length > 500
  ) {
    throw new Error("Description cannot exceed 500 characters");
  }

  // Display order validation
  if (
    display_order !== undefined &&
    display_order !== null &&
    display_order !== ""
  ) {
    if (!Number.isInteger(Number(display_order))) {
      throw new Error("Display order must be a numeric value");
    }
  }

  // is_active validation
  if (is_active !== undefined && is_active !== null) {
    if (![0, 1].includes(Number(is_active))) {
      throw new Error("is_active must be either 0 or 1");
    }
  }

  // Duplicate enum_code within same enum_type
  const duplicate = await pool.query(
    `
      SELECT enum_id
      FROM enum_master
      WHERE LOWER(enum_type) = LOWER($1)
        AND LOWER(enum_code) = LOWER($2);
    `,
    [enum_type.trim(), enum_code.trim()],
  );

  if (duplicate.rows.length > 0) {
    throw new Error("This value already exists for this enum type");
  }

  // Insert Enum Master
  const result = await pool.query(
    `
      INSERT INTO enum_master
      (
        enum_type,
        enum_code,
        label,
        description,
        display_order,
        is_active,
        valid_from_date,
        valid_to_date,
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
        $7,
        $8,
        $9
      )
      RETURNING *;
    `,
    [
      enum_type.trim(),
      enum_code.trim(),
      label.trim(),
      description || null,
      display_order !== undefined && display_order !== ""
        ? Number(display_order)
        : null,
      is_active !== undefined ? Number(is_active) : 1,
      valid_from_date || null,
      valid_to_date || null,
      created_by,
    ],
  );

  const createdEnum = result.rows[0];

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
        'ENUM_MASTER',
        $2,
        'CREATE',
        $3,
        $4
      );
    `,
    [created_by, createdEnum.enum_id, null, createdEnum.label],
  );

  return createdEnum;
};

// Get all Enum Master Service
const getAllEnumMasterService = async () => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  const result = await pool.query(`
    SELECT
      enum_id,
      enum_type,
      enum_code,
      label,
      description,
      display_order,
      is_active,
      discontinued_by,
      discontinued_at,
      valid_from_date,
      valid_to_date,
      created_by,
      creation_timestamp,
      updated_by,
      updation_timestamp
    FROM enum_master
    ORDER BY
      display_order ASC NULLS LAST,
      enum_id ASC;
  `);

  return result.rows;
};

// Get by id Enum Master Services
const getEnumMasterByIdService = async (id) => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  const result = await pool.query(
    `
      SELECT
        enum_id,
        enum_type,
        enum_code,
        label,
        description,
        display_order,
        is_active,
        discontinued_by,
        discontinued_at,
        valid_from_date,
        valid_to_date,
        created_by,
        creation_timestamp,
        updated_by,
        updation_timestamp
      FROM enum_master
      WHERE enum_id = $1;
    `,
    [id],
  );

  if (result.rows.length === 0) {
    throw new Error("Enum master not found");
  }

  return result.rows[0];
};

// Update Enum Master Service
const updateEnumMasterService = async (id, body) => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  const {
    enum_type,
    enum_code,
    label,
    description,
    display_order,
    is_active,
    discontinued_by,
    discontinued_at,
    valid_from_date,
    valid_to_date,
    updated_by,
  } = body;

  // Check if enum exists
  const existing = await pool.query(
    `
      SELECT *
      FROM enum_master
      WHERE enum_id = $1;
    `,
    [id],
  );

  if (existing.rows.length === 0) {
    throw new Error("Enum master not found");
  }

  const oldEnum = existing.rows[0];

  // Enum type validation
  if (enum_type !== undefined) {
    if (!enum_type || !enum_type.trim()) {
      throw new Error("Enum type is required");
    }

    if (enum_type.trim().length > 100) {
      throw new Error("Enum type cannot exceed 100 characters");
    }
  }

  // Enum code validation
  if (enum_code !== undefined) {
    if (!enum_code || !enum_code.trim()) {
      throw new Error("Enum code is required");
    }

    if (enum_code.trim().length > 100) {
      throw new Error("Enum code cannot exceed 100 characters");
    }
  }

  // Label validation
  if (label !== undefined) {
    if (!label || !label.trim()) {
      throw new Error("Label is required");
    }

    if (label.trim().length > 200) {
      throw new Error("Label cannot exceed 200 characters");
    }
  }

  // Description validation
  if (
    description !== undefined &&
    description !== null &&
    description.length > 500
  ) {
    throw new Error("Description cannot exceed 500 characters");
  }

  // Display order validation
  if (
    display_order !== undefined &&
    display_order !== null &&
    display_order !== ""
  ) {
    if (!Number.isInteger(Number(display_order))) {
      throw new Error("Display order must be a numeric value");
    }
  }

  // is_active validation
  if (is_active !== undefined && is_active !== null) {
    if (![0, 1].includes(Number(is_active))) {
      throw new Error("is_active must be either 0 or 1");
    }
  }

  // Final values after update
  const finalEnumType =
    enum_type !== undefined ? enum_type.trim() : oldEnum.enum_type;

  const finalEnumCode =
    enum_code !== undefined ? enum_code.trim() : oldEnum.enum_code;

  // Duplicate enum_type + enum_code check
  const duplicate = await pool.query(
    `
      SELECT enum_id
      FROM enum_master
      WHERE LOWER(enum_type) = LOWER($1)
        AND LOWER(enum_code) = LOWER($2)
        AND enum_id <> $3;
    `,
    [finalEnumType, finalEnumCode, id],
  );

  if (duplicate.rows.length > 0) {
    throw new Error("This value already exists for this enum type");
  }

  // Update Enum Master
  const result = await pool.query(
    `
      UPDATE enum_master
      SET
        enum_type = $1,
        enum_code = $2,
        label = $3,
        description = $4,
        display_order = $5,
        is_active = $6,
        discontinued_by = $7,
        discontinued_at = $8,
        valid_from_date = $9,
        valid_to_date = $10,
        updated_by = $11,
        updation_timestamp = CURRENT_TIMESTAMP
      WHERE enum_id = $12
      RETURNING *;
    `,
    [
      finalEnumType,
      finalEnumCode,
      label !== undefined ? label.trim() : oldEnum.label,
      description !== undefined ? description : oldEnum.description,
      display_order !== undefined && display_order !== ""
        ? Number(display_order)
        : oldEnum.display_order,
      is_active !== undefined ? Number(is_active) : oldEnum.is_active,
      discontinued_by !== undefined ? discontinued_by : oldEnum.discontinued_by,
      discontinued_at !== undefined ? discontinued_at : oldEnum.discontinued_at,
      valid_from_date !== undefined ? valid_from_date : oldEnum.valid_from_date,
      valid_to_date !== undefined ? valid_to_date : oldEnum.valid_to_date,
      updated_by,
      id,
    ],
  );

  const updatedEnum = result.rows[0];

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
        'ENUM_MASTER',
        $2,
        'UPDATE',
        $3,
        $4
      );
    `,
    [updated_by, Number(id), oldEnum.label, updatedEnum.label],
  );

  return updatedEnum;
};

// Delete Enum Master Service
const deleteEnumMasterService = async (id) => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  // Check if enum exists
  const existing = await pool.query(
    `
      SELECT *
      FROM enum_master
      WHERE enum_id = $1;
    `,
    [id],
  );

  if (existing.rows.length === 0) {
    throw new Error("Enum master not found");
  }

  const oldEnum = existing.rows[0];

  // Already inactive
  if (Number(oldEnum.is_active) === 0) {
    throw new Error(
      "Enum master cannot be deactivated because it is already inactive",
    );
  }

  // Soft Delete
  const result = await pool.query(
    `
      UPDATE enum_master
      SET
        is_active = 0,
        discontinued_by = $1,
        discontinued_at = CURRENT_TIMESTAMP,
        updated_by = $1,
        updation_timestamp = CURRENT_TIMESTAMP
      WHERE enum_id = $2
      RETURNING *;
    `,
    [oldEnum.updated_by || oldEnum.created_by, id],
  );

  const deactivatedEnum = result.rows[0];

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
        'ENUM_MASTER',
        $2,
        'UPDATE',
        $3,
        $4
      );
    `,
    [
      oldEnum.updated_by || oldEnum.created_by,
      Number(id),
      oldEnum.label,
      deactivatedEnum.label,
    ],
  );

  return deactivatedEnum;
};

module.exports = {
  createEnumMasterService,
  getAllEnumMasterService,
  getEnumMasterByIdService,
  updateEnumMasterService,
  deleteEnumMasterService,
};
