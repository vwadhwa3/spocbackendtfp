const { getPool } = require("../../config/database");

// Get All Task Types
const getAllTaskTypesService = async () => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  const result = await pool.query(
    `
      SELECT
        task_type_id,
        task_type_code,
        label,
        description,
        role_required,
        is_active,
        valid_from_date,
        valid_to_date,
        created_by,
        creation_timestamp,
        updated_by,
        updation_timestamp,
        discontinued_by,
        discontinued_at
      FROM s_task
      ORDER BY task_type_id ASC;
    `,
  );

  return result.rows;
};

// Create Task
const createTaskService = async (taskData) => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  const {
    application_id,
    task_type_id,
    assigned_to_user_id,
    role_required,
    description,
    created_by_user_id,
    created_by,
    due_by,
  } = taskData;

  // Check application and get case_id
  const applicationResult = await pool.query(
    `
      SELECT
        application_id,
        case_id
      FROM b_applications
      WHERE application_id = $1;
    `,
    [application_id],
  );

  if (applicationResult.rows.length === 0) {
    throw new Error("Application not found");
  }

  const caseId = applicationResult.rows[0].case_id;

  // Create task
  const result = await pool.query(
    `
    INSERT INTO task (
      case_id,
      application_id,
      task_type_id,
      assigned_to_user_id,
      role_required,
      status,
      description,
      created_by_user_id,
      created_by
    )
    VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8)
    RETURNING *;
  `,
    [
      caseId,
      application_id,
      task_type_id,
      assigned_to_user_id,
      role_required,
      description,
      created_by_user_id,
      created_by,
    ],
  );
  return result.rows[0];
};

const getTasksByUserService = async (userId) => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  const result = await pool.query(
    `
      SELECT
        t.task_id,
        t.case_id,
        t.application_id,
        t.task_type_id,
        st.task_type_code,
        st.label AS task_type_label,
        t.assigned_to_user_id,
        t.role_required,
        t.status,
        t.description,
        t.decision,
        t.comments,
        t.created_by_user_id,
        t.due_by,
        t.valid_from_date,
        t.valid_to_date,
        t.created_by,
        t.creation_timestamp,
        t.updated_by,
        t.updation_timestamp
      FROM task t
      JOIN s_task st
        ON st.task_type_id = t.task_type_id
      WHERE t.assigned_to_user_id = $1
      ORDER BY t.task_id ASC;
    `,
    [userId],
  );

  return result.rows;
};

module.exports = {
  getAllTaskTypesService,
  createTaskService,
  getTasksByUserService,
};
