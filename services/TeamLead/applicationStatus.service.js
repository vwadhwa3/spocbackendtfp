const { getPool } = require("../../config/dataBase");

// Team Lead → Documents in Customer Review
const updateApplicationStatusToCustomerReviewService = async (
  applicationId,
  body,
) => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  const { updated_by } = body;

  // 1. Get Team Lead user
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
    throw new Error("Team Lead user not found");
  }

  const user = userResult.rows[0];

  // 2. Verify user is Team Lead
  if (user.role_name !== "Team Lead") {
    throw new Error(
      "Only Team Lead users can move the application to Documents in Customer Review",
    );
  }

  // 3. Get application + current status
  const applicationResult = await pool.query(
    `
      SELECT
        a.application_id,
        a.case_id,
        a.applicant_id,
        a.status_id,
        s.status_code,
        s.label
      FROM b_applications a
      INNER JOIN app_status s
        ON s.status_id = a.status_id
      WHERE a.application_id = $1;
    `,
    [applicationId],
  );

  if (applicationResult.rows.length === 0) {
    throw new Error("Application not found");
  }

  const application = applicationResult.rows[0];

  // 4. Application must be in Documents in TL Review
  if (application.status_code !== "documents_in_tl_review") {
    throw new Error("Application must be in Documents in TL Review status");
  }

  // 5. Get Documents in Customer Review status
  const targetStatusResult = await pool.query(
    `
      SELECT
        status_id,
        status_code,
        label
      FROM app_status
      WHERE status_code = 'documents_in_customer_review'
        AND is_active = 1;
    `,
  );

  if (targetStatusResult.rows.length === 0) {
    throw new Error("Documents in Customer Review status not found");
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

  return {
    ...result.rows[0],
    status_code: targetStatus.status_code,
    status_label: targetStatus.label,
  };
};

module.exports = {
  updateApplicationStatusToCustomerReviewService,
};
