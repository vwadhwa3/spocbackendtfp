const { getPool } = require("../../config/dataBase.js");

// ======================================================
// Create Task
// ======================================================
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
        created_by,
        due_by
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        'pending',
        $6,
        $7,
        $8,
        $9
      )
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
      due_by,
    ],
  );

  return result.rows[0];
};

// ======================================================
// View All Tasks
// ======================================================
const getAllTasksService = async () => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  const result = await pool.query(
    `
      SELECT
        task_id,
        case_id,
        application_id,
        task_type_id,
        assigned_to_user_id,
        role_required,
        status,
        description,
        decision,
        comments,
        created_by_user_id,
        due_by,
        valid_from_date,
        valid_to_date,
        created_by,
        creation_timestamp,
        updated_by,
        updation_timestamp,
        discontinued_by,
        discontinued_at
      FROM task
      ORDER BY task_id ASC;
    `,
  );

  return result.rows;
};

// Get Task by Id
const getTaskByIdService = async (taskId) => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  const result = await pool.query(
    `
      SELECT
        task_id,
        case_id,
        application_id,
        task_type_id,
        assigned_to_user_id,
        role_required,
        status,
        description,
        decision,
        comments,
        created_by_user_id,
        due_by,
        valid_from_date,
        valid_to_date,
        created_by,
        creation_timestamp,
        updated_by,
        updation_timestamp,
        discontinued_by,
        discontinued_at
      FROM task
      WHERE task_id = $1;
    `,
    [taskId],
  );

  if (result.rows.length === 0) {
    throw new Error("Task not found");
  }

  return result.rows[0];
};

// Upate Task
const updateTaskService = async (taskId, taskData) => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  const {
    status,
    decision,
    comments,
    updated_by,
    valid_from_date,
    valid_to_date,
    due_by,
  } = taskData;

  // Check task exists
  const taskCheck = await pool.query(
    `
      SELECT task_id
      FROM task
      WHERE task_id = $1;
    `,
    [taskId],
  );

  if (taskCheck.rows.length === 0) {
    throw new Error("Task not found");
  }

  // Validate status
  if (
    status !== undefined &&
    !["pending", "completed", "rejected"].includes(status)
  ) {
    throw new Error("Invalid task status");
  }

  // Decision required when completing
  if (status === "completed" && (!decision || !decision.trim())) {
    throw new Error("Decision is required when completing a task");
  }

  const result = await pool.query(
    `
      UPDATE task
      SET
        status = COALESCE($1, status),
        decision = COALESCE($2, decision),
        comments = COALESCE($3, comments),
        due_by = COALESCE($4, due_by),
        valid_from_date = COALESCE($5, valid_from_date),
        valid_to_date = COALESCE($6, valid_to_date),
        updated_by = $7,
        updation_timestamp = CURRENT_TIMESTAMP
      WHERE task_id = $8
      RETURNING *;
    `,
    [
      status || null,
      decision || null,
      comments || null,
      due_by || null,
      valid_from_date || null,
      valid_to_date || null,
      updated_by || null,
      taskId,
    ],
  );

  return result.rows[0];
};

module.exports = {
  createTaskService,
  getAllTasksService,
  getTaskByIdService,
  updateTaskService,
};
