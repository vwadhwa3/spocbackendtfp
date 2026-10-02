const { getPool } = require("../../config/database");

// Create S_TASK
const createSTaskService = async (body) => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  const {
    task_type_code,
    label,
    description,
    role_required,
    is_active,
    valid_from_date,
    valid_to_date,
    created_by,
  } = body;

  // Task type code required
  if (!task_type_code || !task_type_code.trim()) {
    throw new Error("Task type code is required");
  }

  // Label required
  if (!label || !label.trim()) {
    throw new Error("Label is required");
  }

  // is_active validation
  if (is_active !== undefined && is_active !== null) {
    if (![0, 1].includes(Number(is_active))) {
      throw new Error("is_active must be either 0 or 1");
    }
  }

  // Duplicate task type code check
  const duplicate = await pool.query(
    `
      SELECT task_type_id
      FROM s_task
      WHERE LOWER(task_type_code) = LOWER($1);
    `,
    [task_type_code.trim()],
  );

  if (duplicate.rows.length > 0) {
    throw new Error("Task type code already exists");
  }

  // Create S_TASK record
  const result = await pool.query(
    `
      INSERT INTO s_task
      (
        task_type_code,
        label,
        description,
        role_required,
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
        $8
      )
      RETURNING *;
    `,
    [
      task_type_code.trim(),
      label.trim(),
      description || null,
      role_required || null,
      is_active !== undefined ? Number(is_active) : 1,
      valid_from_date || null,
      valid_to_date || null,
      created_by,
    ],
  );

  return result.rows[0];
};

module.exports = {
  createSTaskService,
};
