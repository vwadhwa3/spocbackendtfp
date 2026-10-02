const { getPool } = require("../../config/dataBase.js");

// Submit Appointment Details
const submitAppointmentDetailsService = async (applicationId, userId, body) => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  const { appointment_date, appointment_location, appointment_status } = body;

  // Check Lead Consultant role
  const userResult = await pool.query(
    `
      SELECT
        u.user_id,
        r.role_name
      FROM s_user u
      JOIN role r
        ON r.role_id = u.user_role_type_id
      WHERE u.user_id = $1
        AND u.is_active = 1;
    `,
    [userId],
  );

  if (userResult.rows.length === 0) {
    throw new Error("User not found");
  }

  if (userResult.rows[0].role_name !== "Lead Consultant") {
    throw new Error("Only Lead Consultant can submit appointment details");
  }

  // Check application exists
  const applicationResult = await pool.query(
    `
      SELECT application_id
      FROM b_applications
      WHERE application_id = $1;
    `,
    [applicationId],
  );

  if (applicationResult.rows.length === 0) {
    throw new Error("Application not found");
  }

  // Get Appointment Booked status
  const statusResult = await pool.query(
    `
      SELECT status_id
      FROM app_status
      WHERE status_code = 'appointment_booked'
        AND is_active = 1;
    `,
  );

  if (statusResult.rows.length === 0) {
    throw new Error("Appointment Booked status not found");
  }

  const appointmentBookedStatusId = statusResult.rows[0].status_id;

  // Update appointment details and application status
  const result = await pool.query(
    `
      UPDATE b_applications
      SET
        appointment_date = $1,
        appointment_location = $2,
        appointment_status = $3,
        status_id = $4,
        updated_by = $5,
        updation_timestamp = CURRENT_TIMESTAMP
      WHERE application_id = $6
      RETURNING *;
    `,
    [
      appointment_date,
      appointment_location,
      appointment_status,
      appointmentBookedStatusId,
      String(userId),
      applicationId,
    ],
  );

  return result.rows[0];
};

// Create Appointment Monitoring Task
const createAppointmentTaskService = async (applicationId, createdByUserId) => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  // Get application
  const applicationResult = await pool.query(
    `
      SELECT
        application_id,
        case_id,
        vac_account_required
      FROM b_applications
      WHERE application_id = $1;
    `,
    [applicationId],
  );

  if (applicationResult.rows.length === 0) {
    throw new Error("Application not found");
  }

  const application = applicationResult.rows[0];

  // Appointment task is required when VAC account is not required
  if (application.vac_account_required !== 0) {
    throw new Error("Appointment task cannot be created for this application");
  }

  // Get Appointment Monitoring task type
  const taskTypeResult = await pool.query(
    `
      SELECT task_type_id
      FROM s_task
      WHERE task_type_code = 'AppointmentMonitoring'
        AND is_active = 1;
    `,
  );

  if (taskTypeResult.rows.length === 0) {
    throw new Error("Appointment Monitoring task type not found");
  }

  const taskTypeId = taskTypeResult.rows[0].task_type_id;

  // Get Lead Consultant
  const userResult = await pool.query(
    `
      SELECT u.user_id
      FROM s_user u
      JOIN role r
        ON r.role_id = u.user_role_type_id
      WHERE r.role_name = 'Lead Consultant'
        AND u.is_active = 1
      ORDER BY u.user_id ASC
      LIMIT 1;
    `,
  );

  if (userResult.rows.length === 0) {
    throw new Error("Lead Consultant not found");
  }

  const leadConsultantId = userResult.rows[0].user_id;

  // Check duplicate task
  const existingTaskResult = await pool.query(
    `
      SELECT task_id
      FROM task
      WHERE application_id = $1
        AND task_type_id = $2
        AND status = 'pending'
        AND discontinued_at IS NULL;
    `,
    [applicationId, taskTypeId],
  );

  if (existingTaskResult.rows.length > 0) {
    throw new Error("Appointment Monitoring task already exists");
  }

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
      VALUES (
        $1,
        $2,
        $3,
        $4,
        'Lead Consultant',
        'pending',
        'Monitor and book visa appointment',
        $5,
        $6
      )
      RETURNING *;
    `,
    [
      application.case_id,
      applicationId,
      taskTypeId,
      leadConsultantId,
      createdByUserId,
      String(createdByUserId),
    ],
  );

  return result.rows[0];
};

// Get All b_aaplication data
// Get All Applications
const getAllApplicationsService = async () => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  const result = await pool.query(
    `
      SELECT
        application_id,
        case_id,
        applicant_id,
        status_id,
        vac_account_required,
        vac_alias,
        appointment_date,
        appointment_location,
        appointment_status,
        risk_assessment_flag,
        documents_checklist_sent,
        created_by_user_id,
        valid_from_date,
        valid_to_date,
        created_by,
        creation_timestamp,
        updated_by,
        updation_timestamp,
        discontinued_by,
        discontinued_at
      FROM b_applications
      ORDER BY application_id ASC;
    `,
  );

  return result.rows;
};

// Create Application
const createApplicationService = async (data) => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  const {
    case_id,
    applicant_id,
    status_id,
    vac_account_required,
    vac_alias,
    vac_password,
    appointment_date,
    appointment_location,
    appointment_status,
    risk_assessment_flag,
    documents_checklist_sent,
    created_by_user_id,
    valid_from_date,
    valid_to_date,
    created_by,
  } = data;

  const result = await pool.query(
    `
      INSERT INTO b_applications (
        case_id,
        applicant_id,
        status_id,
        vac_account_required,
        vac_alias,
        vac_password,
        appointment_date,
        appointment_location,
        appointment_status,
        risk_assessment_flag,
        documents_checklist_sent,
        created_by_user_id,
        valid_from_date,
        valid_to_date,
        created_by
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15
      )
      RETURNING
        application_id,
        case_id,
        applicant_id,
        status_id,
        vac_account_required,
        vac_alias,
        vac_password,
        appointment_date,
        appointment_location,
        appointment_status,
        risk_assessment_flag,
        documents_checklist_sent,
        created_by_user_id,
        valid_from_date,
        valid_to_date,
        created_by,
        creation_timestamp,
        updated_by,
        updation_timestamp,
        discontinued_by,
        discontinued_at;
    `,
    [
      case_id,
      applicant_id,
      status_id,
      vac_account_required ?? 0,
      vac_alias ?? null,
      vac_password ?? null,
      appointment_date ?? null,
      appointment_location ?? null,
      appointment_status ?? null,
      risk_assessment_flag ?? 0,
      documents_checklist_sent ?? 0,
      created_by_user_id,
      valid_from_date ?? null,
      valid_to_date ?? null,
      created_by,
    ],
  );

  return result.rows[0];
};

module.exports = {
  submitAppointmentDetailsService,
  getAllApplicationsService,
  createAppointmentTaskService,
  createApplicationService,
};
