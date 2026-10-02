const { getPool } = require("../../config/dataBase.js");

// Create Prepare Documents Task
const createPrepareDocumentsTaskService = async (body) => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  const {
    case_id,
    application_id,
    assigned_to_user_id,
    created_by_user_id,
    role_required,
    description,
    due_by,
    valid_from_date,
    valid_to_date,
    created_by,
  } = body;

  // Required validations
  if (!case_id) {
    throw new Error("Case ID is required");
  }

  if (!application_id) {
    throw new Error("Application ID is required");
  }

  if (!assigned_to_user_id) {
    throw new Error("Assigned user ID is required");
  }

  if (!created_by_user_id) {
    throw new Error("Created by user ID is required");
  }

  if (!role_required || !role_required.trim()) {
    throw new Error("Role required is required");
  }

  // Check application
  const application = await pool.query(
    `
      SELECT application_id
      FROM b_applications
      WHERE application_id = $1;
    `,
    [application_id],
  );

  if (application.rows.length === 0) {
    throw new Error("Application not found");
  }

  // Check case
  const caseResult = await pool.query(
    `
      SELECT case_id
      FROM b_case
      WHERE case_id = $1;
    `,
    [case_id],
  );

  if (caseResult.rows.length === 0) {
    throw new Error("Case not found");
  }

  // Check assigned CSR user
  const csrUser = await pool.query(
    `
      SELECT user_id
      FROM s_user
      WHERE user_id = $1;
    `,
    [assigned_to_user_id],
  );

  if (csrUser.rows.length === 0) {
    throw new Error("Assigned CSR user not found");
  }

  // Get Prepare Documents task type
  const taskType = await pool.query(
    `
      SELECT task_type_id
      FROM s_task
      WHERE task_type_code = 'PREPARE_DOCUMENTS'
        AND is_active = 1;
    `,
  );

  if (taskType.rows.length === 0) {
    throw new Error("Prepare Documents task type not found");
  }

  const task_type_id = taskType.rows[0].task_type_id;

  // Create Task
  const result = await pool.query(
    `
      INSERT INTO task
      (
        case_id,
        application_id,
        task_type_id,
        assigned_to_user_id,
        role_required,
        status,
        description,
        created_by_user_id,
        due_by,
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
        'pending',
        $6,
        $7,
        $8,
        $9,
        $10,
        $11
      )
      RETURNING *;
    `,
    [
      case_id,
      application_id,
      task_type_id,
      assigned_to_user_id,
      role_required.trim(),
      description || null,
      created_by_user_id,
      due_by || null,
      valid_from_date || null,
      valid_to_date || null,
      created_by,
    ],
  );

  return result.rows[0];
};

// Get All Prepare Documents Tasks
const getAllPrepareDocumentsTasksService = async () => {
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
      INNER JOIN s_task st
        ON t.task_type_id = st.task_type_id
      WHERE st.task_type_code = 'PrepareDocuments'
      ORDER BY t.task_id DESC;
    `,
  );

  return result.rows;
};
module.exports = {
  createPrepareDocumentsTaskService,
  getAllPrepareDocumentsTasksService,
};
