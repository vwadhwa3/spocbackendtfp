const { getPool } = require("../../config/dataBase.js");

// CSR → Documents in TL Review
// const updateApplicationStatusService = async (applicationId, body) => {
//   const pool = getPool();

//   if (!pool) {
//     throw new Error("Database connection not initialized.");
//   }

//   const { updated_by } = body;

//   // --------------------------------------------------
//   // 1. Get CSR user
//   // --------------------------------------------------
//   const userResult = await pool.query(
//     `
//       SELECT
//         u.user_id,
//         r.role_name
//       FROM s_user u
//       INNER JOIN role r
//         ON r.role_id = u.user_role_type_id
//       WHERE u.user_id = $1
//         AND u.is_active = 1;
//     `,
//     [updated_by],
//   );

//   if (userResult.rows.length === 0) {
//     throw new Error("CSR user not found");
//   }

//   const user = userResult.rows[0];

//   // --------------------------------------------------
//   // 2. Verify user is CSR
//   // --------------------------------------------------
//   if (user.role_name !== "CSR") {
//     throw new Error(
//       "Only CSR users can move the application to Documents in TL Review",
//     );
//   }

//   // --------------------------------------------------
//   // 3. Get application + current status
//   // --------------------------------------------------
//   const applicationResult = await pool.query(
//     `
//       SELECT
//         a.application_id,
//         a.status_id,
//         s.status_code,
//         s.label
//       FROM b_applications a
//       INNER JOIN app_status s
//         ON s.status_id = a.status_id
//       WHERE a.application_id = $1;
//     `,
//     [applicationId],
//   );

//   if (applicationResult.rows.length === 0) {
//     throw new Error("Application not found");
//   }

//   const application = applicationResult.rows[0];

//   // --------------------------------------------------
//   // 4. Application must currently be Appointment Booked
//   // --------------------------------------------------
//   if (application.status_code !== "appointment_booked") {
//     throw new Error("Application must be in Appointment Booked status");
//   }

//   // --------------------------------------------------
//   // 5. Get Documents in TL Review status
//   // --------------------------------------------------
//   const targetStatusResult = await pool.query(
//     `
//       SELECT
//         status_id,
//         status_code,
//         label
//       FROM app_status
//       WHERE status_code = 'documents_in_tl_review'
//         AND is_active = 1;
//     `,
//   );

//   if (targetStatusResult.rows.length === 0) {
//     throw new Error("Documents in TL Review status not found");
//   }

//   const targetStatus = targetStatusResult.rows[0];

//   // --------------------------------------------------
//   // 6. Update application status
//   // --------------------------------------------------
//   const result = await pool.query(
//     `
//       UPDATE b_applications
//       SET
//         status_id = $1,
//         updated_by = $2,
//         updation_timestamp = CURRENT_TIMESTAMP
//       WHERE application_id = $3
//       RETURNING
//         application_id,
//         case_id,
//         applicant_id,
//         status_id,
//         updated_by,
//         updation_timestamp;
//     `,
//     [targetStatus.status_id, String(updated_by), applicationId],
//   );

//   return {
//     ...result.rows[0],
//     status_code: targetStatus.status_code,
//     status_label: targetStatus.label,
//   };
// };

// CSR → Documents in TL Review
const updateApplicationStatusService = async (applicationId, body) => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  const { updated_by } = body;

  // 1. Get CSR user
  const userResult = await pool.query(
    `
      SELECT
        u.user_id,
        r.role_name
      FROM s_user u
      INNER JOIN role r
        ON r.role_id = u.user_role_type_id
      WHERE u.user_id = $1
        AND u.is_active = 1;
    `,
    [updated_by],
  );

  if (userResult.rows.length === 0) {
    throw new Error("CSR user not found");
  }

  const user = userResult.rows[0];

  // 2. Verify user is CSR
  if (user.role_name !== "CSR") {
    throw new Error(
      "Only CSR users can move the application to Documents in TL Review",
    );
  }

  // 3. Get application + applicant + current status
  const applicationResult = await pool.query(
    `
      SELECT
        a.application_id,
        a.case_id,
        a.applicant_id,
        a.status_id,
        s.status_code,
        s.label,
        c.first_name,
        c.surname
      FROM b_applications a
      INNER JOIN app_status s
        ON s.status_id = a.status_id
      INNER JOIN b_contact c
        ON c.contact_id = a.applicant_id
      WHERE a.application_id = $1;
    `,
    [applicationId],
  );

  if (applicationResult.rows.length === 0) {
    throw new Error("Application not found");
  }

  const application = applicationResult.rows[0];

  // 4. Must currently be Appointment Booked
  if (application.status_code !== "appointment_booked") {
    throw new Error("Application must be in Appointment Booked status");
  }

  // 5. Get Documents in TL Review status
  const targetStatusResult = await pool.query(
    `
      SELECT
        status_id,
        status_code,
        label
      FROM app_status
      WHERE status_code = 'documents_in_tl_review'
        AND is_active = 1;
    `,
  );

  if (targetStatusResult.rows.length === 0) {
    throw new Error("Documents in TL Review status not found");
  }

  const targetStatus = targetStatusResult.rows[0];

  // 6. Update application status
  const result = await pool.query(
    `
      UPDATE b_applications
      SET
        status_id = $1,
        updated_by = $2,
        updation_timestamp = CURRENT_TIMESTAMP
      WHERE application_id = $3
      RETURNING
        application_id,
        case_id,
        applicant_id,
        status_id,
        updated_by,
        updation_timestamp;
    `,
    [targetStatus.status_id, String(updated_by), applicationId],
  );

  // 7. Get Team Lead user
  const teamLeadResult = await pool.query(
    `
      SELECT
        u.user_id,
        u.first_name,
        u.last_name
      FROM s_user u
      INNER JOIN role r
        ON r.role_id = u.user_role_type_id
      WHERE r.role_name = 'Team Lead'
        AND u.is_active = 1
      ORDER BY u.user_id
      LIMIT 1;
    `,
  );

  if (teamLeadResult.rows.length === 0) {
    throw new Error("Team Lead user not found");
  }

  const teamLead = teamLeadResult.rows[0];

  // 8. Get Review Prepared Documents task type
  const taskTypeResult = await pool.query(
    `
      SELECT
        task_type_id
      FROM s_task
      WHERE task_type_code = 'ReviewPreparedDocuments'
        AND is_active = 1;
    `,
  );

  if (taskTypeResult.rows.length === 0) {
    throw new Error("Review Prepared Documents task type not found");
  }

  const taskType = taskTypeResult.rows[0];

  // 9. Prepare applicant name
  const applicantName = `${application.first_name}${
    application.surname ? ` ${application.surname}` : ""
  }`;

  // 10. Create Team Lead task
  const taskResult = await pool.query(
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
        created_by
      )
      VALUES
      (
        $1,
        $2,
        $3,
        $4,
        'Team Lead',
        'pending',
        $5,
        $6,
        $7
      )
      RETURNING *;
    `,
    [
      application.case_id,
      application.application_id,
      taskType.task_type_id,
      teamLead.user_id,
      `Review prepared documents for ${applicantName}`,
      updated_by,
      String(updated_by),
    ],
  );

  return {
    ...result.rows[0],
    status_code: targetStatus.status_code,
    status_label: targetStatus.label,
    team_lead_task: taskResult.rows[0],
  };
};

// CSR → Application Information For Review
const updateApplicationInformationReviewService = async (
  applicationId,
  body,
) => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  const { updated_by } = body;

  // 1. Get CSR user
  const userResult = await pool.query(
    `
      SELECT
        u.user_id,
        r.role_name
      FROM s_user u
      INNER JOIN role r
        ON r.role_id = u.user_role_type_id
      WHERE u.user_id = $1
        AND u.is_active = 1;
    `,
    [updated_by],
  );

  if (userResult.rows.length === 0) {
    throw new Error("CSR user not found");
  }

  const user = userResult.rows[0];

  // 2. Verify user is CSR
  if (user.role_name !== "CSR") {
    throw new Error(
      "Only CSR users can move the application to Application Information For Review",
    );
  }

  // 3. Check application exists
  const applicationResult = await pool.query(
    `
      SELECT
        application_id,
        case_id,
        applicant_id,
        status_id
      FROM b_applications
      WHERE application_id = $1;
    `,
    [applicationId],
  );

  if (applicationResult.rows.length === 0) {
    throw new Error("Application not found");
  }

  // 4. Get Application Information For Review status
  const targetStatusResult = await pool.query(
    `
      SELECT
        status_id,
        status_code,
        label
      FROM app_status
      WHERE status_code = 'application_information_for_review'
        AND is_active = 1;
    `,
  );

  if (targetStatusResult.rows.length === 0) {
    throw new Error("Application Information For Review status not found");
  }

  const targetStatus = targetStatusResult.rows[0];

  // 5. Update application status
  const result = await pool.query(
    `
      UPDATE b_applications
      SET
        status_id = $1,
        updated_by = $2,
        updation_timestamp = CURRENT_TIMESTAMP
      WHERE application_id = $3
      RETURNING
        application_id,
        case_id,
        applicant_id,
        status_id,
        updated_by,
        updation_timestamp;
    `,
    [targetStatus.status_id, String(updated_by), applicationId],
  );

  return {
    ...result.rows[0],
    status_code: targetStatus.status_code,
    status_label: targetStatus.label,
  };
};

module.exports = {
  updateApplicationStatusService,
  updateApplicationInformationReviewService,
};
