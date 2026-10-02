const { getPool } = require("../../config/database");

// Create Application Status
const createAppStatusService = async (body) => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  const {
    status_code,
    label,
    description,
    next_status_ids,
    is_terminal,
    display_order,
    is_active,
    discontinued_by,
    discontinued_at,
    valid_from_date,
    valid_to_date,
    created_by,
  } = body;

  // Status code required
  if (!status_code || !status_code.trim()) {
    throw new Error("Status code is required");
  }

  // Status code max 50 characters
  if (status_code.trim().length > 50) {
    throw new Error("Status code cannot exceed 50 characters");
  }

  // Label required
  if (!label || !label.trim()) {
    throw new Error("Label is required");
  }

  // Label max 100 characters
  if (label.trim().length > 100) {
    throw new Error("Label cannot exceed 100 characters");
  }

  // is_terminal validation
  if (is_terminal !== undefined && is_terminal !== null) {
    if (![0, 1].includes(Number(is_terminal))) {
      throw new Error("is_terminal must be either 0 or 1");
    }
  }

  // is_active validation
  if (is_active !== undefined && is_active !== null) {
    if (![0, 1].includes(Number(is_active))) {
      throw new Error("is_active must be either 0 or 1");
    }
  }

  // display_order validation
  if (
    display_order !== undefined &&
    display_order !== null &&
    display_order !== ""
  ) {
    if (!Number.isInteger(Number(display_order))) {
      throw new Error("Display order must be a numeric value");
    }
  }

  // Validate next_status_ids
  if (next_status_ids && next_status_ids.trim()) {
    const statusIds = next_status_ids
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    for (const statusId of statusIds) {
      if (!/^\d+$/.test(statusId)) {
        throw new Error(`Invalid next status ID: ${statusId}`);
      }

      const statusExists = await pool.query(
        `
          SELECT status_id
          FROM app_status
          WHERE status_id = $1;
        `,
        [Number(statusId)],
      );

      if (statusExists.rows.length === 0) {
        throw new Error(`Next status ID ${statusId} does not exist`);
      }
    }
  }

  // Duplicate status code check
  const duplicate = await pool.query(
    `
      SELECT status_id
      FROM app_status
      WHERE LOWER(status_code) = LOWER($1);
    `,
    [status_code.trim()],
  );

  if (duplicate.rows.length > 0) {
    throw new Error("Application status already exists");
  }

  // Insert Application Status
  const result = await pool.query(
    `
      INSERT INTO app_status
      (
        status_code,
        label,
        description,
        next_status_ids,
        is_terminal,
        display_order,
        is_active,
        discontinued_by,
        discontinued_at,
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
        $9,
        $10,
        $11,
        $12
      )
      RETURNING *;
    `,
    [
      status_code.trim(),
      label.trim(),
      description || null,
      next_status_ids || null,
      is_terminal !== undefined ? Number(is_terminal) : 0,
      display_order !== undefined && display_order !== ""
        ? Number(display_order)
        : null,
      is_active !== undefined ? Number(is_active) : 1,
      discontinued_by || null,
      discontinued_at || null,
      valid_from_date || null,
      valid_to_date || null,
      created_by,
    ],
  );

  const createdStatus = result.rows[0];

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
      'APP_STATUS',
      $2,
      'CREATE',
      $3,
      $4
    );
  `,
    [created_by, createdStatus.status_id, null, createdStatus.label],
  );

  return createdStatus;

  // return result.rows[0];
};

// Get All Application Statuses
const getAllAppStatusService = async () => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  const result = await pool.query(`
    SELECT
      status_id,
      status_code,
      label,
      description,
      next_status_ids,
      is_terminal,
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
    FROM app_status
    ORDER BY
      display_order ASC NULLS LAST,
      status_id ASC;
  `);

  return result.rows;
};

// Get Application Status By ID
const getAppStatusByIdService = async (id) => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  const result = await pool.query(
    `
      SELECT
        status_id,
        status_code,
        label,
        description,
        next_status_ids,
        is_terminal,
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
      FROM app_status
      WHERE status_id = $1;
    `,
    [id],
  );

  if (result.rows.length === 0) {
    throw new Error("Application status not found");
  }

  return result.rows[0];
};

// Update Application Status
const updateAppStatusService = async (id, body) => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  const {
    status_code,
    label,
    description,
    next_status_ids,
    is_terminal,
    display_order,
    is_active,
    discontinued_by,
    discontinued_at,
    valid_from_date,
    valid_to_date,
    updated_by,
  } = body;

  // Check if status exists
  const existing = await pool.query(
    `
      SELECT *
      FROM app_status
      WHERE status_id = $1;
    `,
    [id],
  );

  if (existing.rows.length === 0) {
    throw new Error("Application status not found");
  }

  const oldStatus = existing.rows[0];

  // Status code is immutable
  if (
    status_code !== undefined &&
    status_code.trim() !== oldStatus.status_code
  ) {
    throw new Error("Status code cannot be changed");
  }

  // Label required
  if (label !== undefined) {
    if (!label || !label.trim()) {
      throw new Error("Label is required");
    }

    if (label.trim().length > 100) {
      throw new Error("Label cannot exceed 100 characters");
    }
  }

  // is_terminal validation
  if (is_terminal !== undefined && is_terminal !== null) {
    if (![0, 1].includes(Number(is_terminal))) {
      throw new Error("is_terminal must be either 0 or 1");
    }
  }

  // is_active validation
  if (is_active !== undefined && is_active !== null) {
    if (![0, 1].includes(Number(is_active))) {
      throw new Error("is_active must be either 0 or 1");
    }
  }

  // display_order validation
  if (
    display_order !== undefined &&
    display_order !== null &&
    display_order !== ""
  ) {
    if (!Number.isInteger(Number(display_order))) {
      throw new Error("Display order must be a numeric value");
    }
  }

  // Validate next_status_ids
  if (next_status_ids && next_status_ids.trim()) {
    const statusIds = next_status_ids
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    for (const statusId of statusIds) {
      if (!/^\d+$/.test(statusId)) {
        throw new Error(`Invalid next status ID: ${statusId}`);
      }

      const statusExists = await pool.query(
        `
          SELECT status_id
          FROM app_status
          WHERE status_id = $1;
        `,
        [Number(statusId)],
      );

      if (statusExists.rows.length === 0) {
        throw new Error(`Next status ID ${statusId} does not exist`);
      }
    }
  }

  // Update Application Status
  const result = await pool.query(
    `
      UPDATE app_status
      SET
        label = $1,
        description = $2,
        next_status_ids = $3,
        is_terminal = $4,
        display_order = $5,
        is_active = $6,
        discontinued_by = $7,
        discontinued_at = $8,
        valid_from_date = $9,
        valid_to_date = $10,
        updated_by = $11,
        updation_timestamp = CURRENT_TIMESTAMP
      WHERE status_id = $12
      RETURNING *;
    `,
    [
      label !== undefined ? label.trim() : oldStatus.label,
      description !== undefined ? description : oldStatus.description,
      next_status_ids !== undefined
        ? next_status_ids
        : oldStatus.next_status_ids,
      is_terminal !== undefined ? Number(is_terminal) : oldStatus.is_terminal,
      display_order !== undefined && display_order !== ""
        ? Number(display_order)
        : oldStatus.display_order,
      is_active !== undefined ? Number(is_active) : oldStatus.is_active,
      discontinued_by !== undefined
        ? discontinued_by
        : oldStatus.discontinued_by,
      discontinued_at !== undefined
        ? discontinued_at
        : oldStatus.discontinued_at,
      valid_from_date !== undefined
        ? valid_from_date
        : oldStatus.valid_from_date,
      valid_to_date !== undefined ? valid_to_date : oldStatus.valid_to_date,
      updated_by,
      id,
    ],
  );

  const updatedStatus = result.rows[0];

  // SYSTEM_LOG - UPDATE
  // old_state and new_state are VARCHAR(100) in LIVE DB.
  // Therefore, store the old and new labels instead of full JSON.
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
        'APP_STATUS',
        $2,
        'UPDATE',
        $3,
        $4
      );
    `,
    [updated_by, Number(id), oldStatus.label, updatedStatus.label],
  );

  return updatedStatus;
};

// Soft Delete Application Status
const deleteAppStatusService = async (id) => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  // Check if status exists
  const existing = await pool.query(
    `
      SELECT *
      FROM app_status
      WHERE status_id = $1;
    `,
    [id],
  );

  if (existing.rows.length === 0) {
    throw new Error("Application status not found");
  }

  const oldStatus = existing.rows[0];

  // Already inactive
  if (Number(oldStatus.is_active) === 0) {
    throw new Error(
      "Application status cannot be deactivated because it is already inactive",
    );
  }

  // Soft Delete
  const result = await pool.query(
    `
      UPDATE app_status
      SET
        is_active = 0,
        discontinued_by = $1,
        discontinued_at = CURRENT_TIMESTAMP,
        updated_by = $1,
        updation_timestamp = CURRENT_TIMESTAMP
      WHERE status_id = $2
      RETURNING *;
    `,
    [oldStatus.updated_by || oldStatus.created_by, id],
  );

  const deactivatedStatus = result.rows[0];

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
        'APP_STATUS',
        $2,
        'UPDATE',
        $3,
        $4
      );
    `,
    [
      oldStatus.updated_by || oldStatus.created_by,
      Number(id),
      oldStatus.label,
      deactivatedStatus.label,
    ],
  );

  return deactivatedStatus;
};

module.exports = {
  createAppStatusService,
  getAllAppStatusService,
  getAppStatusByIdService,
  updateAppStatusService,
  deleteAppStatusService,
};
