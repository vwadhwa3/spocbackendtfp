const { getPool } = require("../../config/database");

// Team Lead → Review Application Information Task creation
const createApplicationReviewTaskService = async (applicationId, body) => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  const { created_by_user_id } = body;

  if (!created_by_user_id) {
    throw new Error("created_by_user_id is required");
  }

  // --------------------------------------------------
  // 1. Get Application + Current Status
  // --------------------------------------------------
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

  // --------------------------------------------------
  // 2. Application must be in Application Information
  //    For Review status
  // --------------------------------------------------
  if (application.status_code !== "application_information_for_review") {
    throw new Error(
      "Application must be in Application Information For Review status",
    );
  }

  // --------------------------------------------------
  // 3. Get Team Lead
  // --------------------------------------------------
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

  // --------------------------------------------------
  // 4. Get Review Application Information task type
  // --------------------------------------------------
  const taskTypeResult = await pool.query(
    `
      SELECT
        task_type_id,
        task_type_code,
        label
      FROM s_task
      WHERE task_type_code = 'ReviewApplicationInformation'
        AND is_active = 1;
    `,
  );

  if (taskTypeResult.rows.length === 0) {
    throw new Error("Review Application Information task type not found");
  }

  const taskType = taskTypeResult.rows[0];

  // --------------------------------------------------
  // 5. Check Duplicate Task
  // --------------------------------------------------
  const existingTaskResult = await pool.query(
    `
      SELECT
        task_id,
        status
      FROM task
      WHERE application_id = $1
        AND task_type_id = $2
        AND role_required = 'Team Lead'
        AND status = 'pending';
    `,
    [applicationId, taskType.task_type_id],
  );

  if (existingTaskResult.rows.length > 0) {
    throw new Error("Review Application Information task already exists");
  }

  // --------------------------------------------------
  // 6. Create Team Lead Task
  // --------------------------------------------------
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
      "Review submitted application information and perform risk assessment.",
      created_by_user_id,
      String(created_by_user_id),
    ],
  );

  return {
    ...taskResult.rows[0],
    task_type_code: taskType.task_type_code,
    task_type_label: taskType.label,
    assigned_to_user_name: `${teamLead.first_name}${teamLead.last_name ? ` ${teamLead.last_name}` : ""}`,
  };
};

// Team Lead: Review Application Information
const reviewApplicationService = async (application_id, body) => {
  const pool = getPool();

  const { updated_by, risk_assessment_flag, vac_account_required } = body;

  // --------------------------------------------------
  // 1. Validate required field
  // --------------------------------------------------

  if (!updated_by) {
    throw new Error("updated_by is required");
  }

  // --------------------------------------------------
  // 2. Validate Risk Assessment Flag
  // --------------------------------------------------

  if (![0, 1].includes(Number(risk_assessment_flag))) {
    throw new Error("risk_assessment_flag must be 0 or 1");
  }

  // --------------------------------------------------
  // 3. Validate VAC Account Required
  // --------------------------------------------------

  if (![0, 1].includes(Number(vac_account_required))) {
    throw new Error("vac_account_required must be 0 or 1");
  }

  // --------------------------------------------------
  // 4. Check Application
  // --------------------------------------------------

  const applicationResult = await pool.query(
    `
      SELECT
        a.application_id,
        a.case_id,
        a.applicant_id,
        a.status_id,
        s.status_code,
        s.label AS status_label
      FROM b_applications a
      INNER JOIN app_status s
        ON a.status_id = s.status_id
      WHERE a.application_id = $1
        AND a.discontinued_at IS NULL
    `,
    [application_id],
  );

  if (applicationResult.rows.length === 0) {
    throw new Error("Application not found");
  }

  const application = applicationResult.rows[0];

  // --------------------------------------------------
  // 5. Application must be in
  //    Application Information For Review
  // --------------------------------------------------

  if (application.status_code !== "application_information_for_review") {
    throw new Error(
      "Application must be in Application Information For Review status",
    );
  }

  // --------------------------------------------------
  // 6. Verify Team Lead
  // --------------------------------------------------
  const teamLeadResult = await pool.query(
    `
    SELECT
      u.user_id,
      u.first_name,
      u.last_name,
      r.role_name
    FROM s_user u
    INNER JOIN role r
      ON r.role_id = u.user_role_type_id
    WHERE u.user_id = $1
      AND r.role_name = 'Team Lead'
      AND u.is_active = 1;
  `,
    [updated_by],
  );

  if (teamLeadResult.rows.length === 0) {
    throw new Error("Team Lead user not found");
  }

  const teamLead = teamLeadResult.rows[0];

  // --------------------------------------------------
  // 7. Check Review Application Information Task
  // --------------------------------------------------

  const taskResult = await pool.query(
    `
      SELECT
        t.task_id,
        t.task_type_id,
        t.assigned_to_user_id,
        t.status
      FROM task t
      INNER JOIN s_task st
        ON t.task_type_id = st.task_type_id
      WHERE t.application_id = $1
        AND st.task_type_code = 'ReviewApplicationInformation'
        AND st.is_active = 1
        AND t.assigned_to_user_id = $2
        AND t.status = 'pending'
      ORDER BY t.task_id DESC
      LIMIT 1
    `,
    [application_id, teamLead.user_id],
  );

  if (taskResult.rows.length === 0) {
    throw new Error("Review Application Information task not found");
  }

  const task = taskResult.rows[0];

  // --------------------------------------------------
  // 8. Update Application
  // --------------------------------------------------

  const applicationUpdateResult = await pool.query(
    `
      UPDATE b_applications
      SET
        risk_assessment_flag = $1,
        vac_account_required = $2,
        updated_by = $3,
        updation_timestamp = NOW()
      WHERE application_id = $4
      RETURNING
        application_id,
        case_id,
        applicant_id,
        status_id,
        risk_assessment_flag,
        vac_account_required,
        updated_by,
        updation_timestamp
    `,
    [
      Number(risk_assessment_flag),
      Number(vac_account_required),
      String(updated_by),
      application_id,
    ],
  );

  const updatedApplication = applicationUpdateResult.rows[0];

  // --------------------------------------------------
  // 9. Complete Team Lead Review Task
  // --------------------------------------------------

  const taskUpdateResult = await pool.query(
    `
      UPDATE task
      SET
        status = 'completed',
        updated_by = $1,
        updation_timestamp = NOW()
      WHERE task_id = $2
      RETURNING
        task_id,
        status,
        updated_by,
        updation_timestamp
    `,
    [String(updated_by), task.task_id],
  );

  const updatedTask = taskUpdateResult.rows[0];

  // --------------------------------------------------
  // 10. Return Response
  // --------------------------------------------------

  return {
    application: {
      ...updatedApplication,
      status_code: application.status_code,
      status_label: application.status_label,
    },

    task: updatedTask,

    reviewed_by: {
      user_id: teamLead.user_id,
      name: `${teamLead.first_name || ""} ${teamLead.last_name || ""}`.trim(),
      role: teamLead.role_name,
    },
  };
};

// Team Lead: View Document Checklist
const getApplicationChecklistService = async (application_id) => {
  const pool = getPool();

  if (!application_id) {
    const error = new Error("application_id is required.");
    error.statusCode = 400;
    throw error;
  }

  // Check application and current status
  const applicationResult = await pool.query(
    `
    SELECT
      a.application_id,
      a.case_id,
      a.applicant_id,
      a.status_id,
      s.status_code,
      s.label AS status_label,
      a.risk_assessment_flag,
      a.vac_account_required
    FROM b_applications a
    INNER JOIN app_status s
      ON s.status_id = a.status_id
    WHERE a.application_id = $1
      AND a.discontinued_at IS NULL;
    `,
    [application_id],
  );

  if (applicationResult.rows.length === 0) {
    const error = new Error("Application not found.");
    error.statusCode = 404;
    throw error;
  }

  const application = applicationResult.rows[0];

  if (application.status_code !== "application_information_for_review") {
    const error = new Error(
      "Application is not in Application Information For Review status.",
    );
    error.statusCode = 400;
    throw error;
  }

  // Fetch active document types
  const documentResult = await pool.query(
    `
    SELECT
      dt.document_type_id,
      dt.name,
      dt.description,
      dt.safe_to_dispatch_before_balance,
      dt.visa_category_id,
      dt.document_category_id,
      dc.name AS document_category_name
    FROM document_type dt
    LEFT JOIN document_category dc
      ON dc.document_category_id = dt.document_category_id
    WHERE dt.discontinued_at IS NULL
    ORDER BY dt.document_type_id;
    `,
  );

  // Required documents for this workflow
  const documents = documentResult.rows.map((document) => ({
    document_type_id: document.document_type_id,
    name: document.name,
    description: document.description,
    document_category_id: document.document_category_id,
    document_category_name: document.document_category_name,
    safe_to_dispatch_before_balance: document.safe_to_dispatch_before_balance,
    is_required: [1, 2].includes(document.document_type_id) ? 1 : 0,
    is_selected_by_team_lead: [1, 2].includes(document.document_type_id)
      ? 1
      : 0,
  }));

  return {
    application: {
      application_id: application.application_id,
      case_id: application.case_id,
      applicant_id: application.applicant_id,
      status_id: application.status_id,
      status_code: application.status_code,
      status_label: application.status_label,
      risk_assessment_flag: application.risk_assessment_flag,
      vac_account_required: application.vac_account_required,
    },
    documents,
  };
};

// Team Lead: Generate / Save Document Checklist
const generateApplicationChecklistService = async (application_id, body) => {
  const pool = getPool();
  const client = await pool.connect();

  try {
    const { updated_by, documents } = body;

    // ---------------------------------------------------------
    // 1. Basic validation
    // ---------------------------------------------------------
    if (!updated_by) {
      throw new Error("updated_by is required");
    }

    if (!Array.isArray(documents) || documents.length === 0) {
      throw new Error("documents array is required");
    }

    // ---------------------------------------------------------
    // 2. Verify Team Lead
    // ---------------------------------------------------------
    const teamLeadResult = await client.query(
      `
  SELECT u.user_id
  FROM s_user u
  INNER JOIN role r
    ON r.role_id = u.user_role_type_id
  WHERE u.user_id = $1
    AND LOWER(r.role_name) = LOWER('Team Lead')
    AND u.discontinued_at IS NULL
  `,
      [updated_by],
    );

    if (teamLeadResult.rows.length === 0) {
      throw new Error("Only Team Lead can generate document checklist");
    }

    // ---------------------------------------------------------
    // 3. Get application
    // ---------------------------------------------------------
    const applicationResult = await client.query(
      `
      SELECT
        a.application_id,
        a.case_id,
        a.applicant_id,
        a.status_id,
        s.status_code,
        s.label AS status_label,
        a.risk_assessment_flag,
        a.vac_account_required,
        a.documents_checklist_sent
      FROM b_applications a
      INNER JOIN app_status s
        ON s.status_id = a.status_id
      WHERE a.application_id = $1
        AND a.discontinued_at IS NULL
      `,
      [application_id],
    );

    if (applicationResult.rows.length === 0) {
      throw new Error("Application not found");
    }

    const application = applicationResult.rows[0];

    // ---------------------------------------------------------
    // 4. Checklist can only be generated from Application
    //    Information For Review
    // ---------------------------------------------------------
    if (application.status_code !== "application_information_for_review") {
      throw new Error(
        "Application must be in Application Information For Review status",
      );
    }

    // ---------------------------------------------------------
    // 5. Validate document IDs
    // ---------------------------------------------------------
    const documentIds = documents.map((document) =>
      Number(document.document_type_id),
    );

    const uniqueDocumentIds = [...new Set(documentIds)];

    if (uniqueDocumentIds.length !== documentIds.length) {
      throw new Error("Duplicate document_type_id is not allowed");
    }

    if (documentIds.some((id) => !Number.isInteger(id) || id <= 0)) {
      throw new Error("Invalid document_type_id");
    }

    // ---------------------------------------------------------
    // 6. Get document master data
    // ---------------------------------------------------------
    const documentMasterResult = await client.query(
      `
      SELECT
        document_type_id,
        name,
        description,
        safe_to_dispatch_before_balance
      FROM document_type
      WHERE document_type_id = ANY($1::integer[])
        AND discontinued_at IS NULL
      ORDER BY document_type_id
      `,
      [uniqueDocumentIds],
    );

    if (documentMasterResult.rows.length !== uniqueDocumentIds.length) {
      throw new Error("One or more document types not found");
    }

    const documentMasterMap = new Map();

    documentMasterResult.rows.forEach((document) => {
      documentMasterMap.set(Number(document.document_type_id), document);
    });

    // ---------------------------------------------------------
    // 7. Validate checklist selection
    // ---------------------------------------------------------
    const preparedDocuments = documents.map((document) => {
      const documentTypeId = Number(document.document_type_id);
      const masterDocument = documentMasterMap.get(documentTypeId);

      const isRequired = Number(document.is_required);
      const isSelected = Number(document.is_selected_by_team_lead);

      if (![0, 1].includes(isRequired)) {
        throw new Error(
          `is_required must be 0 or 1 for document_type_id ${documentTypeId}`,
        );
      }

      if (![0, 1].includes(isSelected)) {
        throw new Error(
          `is_selected_by_team_lead must be 0 or 1 for document_type_id ${documentTypeId}`,
        );
      }

      // Required documents must always be selected
      if (isRequired === 1 && isSelected !== 1) {
        throw new Error(
          `Required document must be selected for document_type_id ${documentTypeId}`,
        );
      }

      return {
        document_type_id: documentTypeId,
        name: masterDocument.name,
        description: masterDocument.description,
        is_required: isRequired,
        is_selected_by_team_lead: isSelected,
        safe_to_dispatch_before_balance:
          masterDocument.safe_to_dispatch_before_balance,
      };
    });

    const selectedDocuments = preparedDocuments.filter(
      (document) => document.is_selected_by_team_lead === 1,
    );

    if (selectedDocuments.length === 0) {
      throw new Error("At least one document must be selected");
    }

    // ---------------------------------------------------------
    // 8. Decide next application status
    //
    // VAC Account Required = Yes  -> VAC Account Creation
    // VAC Account Required = No   -> Appointment Monitoring
    // ---------------------------------------------------------
    const nextStatusCode =
      Number(application.vac_account_required) === 1
        ? "vac_account_creation"
        : "appointment_monitoring";

    const nextStatusResult = await client.query(
      `
      SELECT
        status_id,
        status_code,
        label
      FROM app_status
      WHERE status_code = $1
        AND discontinued_at IS NULL
      LIMIT 1
      `,
      [nextStatusCode],
    );

    if (nextStatusResult.rows.length === 0) {
      throw new Error(`Next application status not found: ${nextStatusCode}`);
    }

    const nextStatus = nextStatusResult.rows[0];

    // ---------------------------------------------------------
    // 9. Start transaction
    // ---------------------------------------------------------
    await client.query("BEGIN");

    // ---------------------------------------------------------
    // 10. Remove previous checklist
    // ---------------------------------------------------------
    await client.query(
      `
      DELETE FROM app_doc_checklist
      WHERE application_id = $1
      `,
      [application_id],
    );

    // ---------------------------------------------------------
    // 11. Insert selected checklist documents
    // ---------------------------------------------------------
    for (const document of selectedDocuments) {
      await client.query(
        `
        INSERT INTO app_doc_checklist (
          application_id,
          document_type_id,
          is_required,
          is_selected_by_team_lead,
          is_received,
          safe_to_dispatch_before_balance,
          generated_by_user_id,
          created_by
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          0,
          $5,
          $6,
          $7
        )
        `,
        [
          application_id,
          document.document_type_id,
          document.is_required,
          document.is_selected_by_team_lead,
          document.safe_to_dispatch_before_balance,
          updated_by,
          String(updated_by),
        ],
      );
    }

    // ---------------------------------------------------------
    // 12. Mark checklist as sent to customer
    //
    // Actual WATI / WhatsApp integration will be plugged
    // into this same service later.
    // ---------------------------------------------------------
    const applicationUpdateResult = await client.query(
      `
      UPDATE b_applications
      SET
        documents_checklist_sent = 1,
        status_id = $1,
        updated_by = $2,
        updation_timestamp = NOW()
      WHERE application_id = $3
      RETURNING
        application_id,
        case_id,
        applicant_id,
        status_id,
        risk_assessment_flag,
        vac_account_required,
        documents_checklist_sent,
        updated_by,
        updation_timestamp
      `,
      [nextStatus.status_id, String(updated_by), application_id],
    );

    // ---------------------------------------------------------
    // 13. Get final checklist
    // ---------------------------------------------------------
    const checklistResult = await client.query(
      `
      SELECT
        c.checklist_id,
        c.application_id,
        c.document_type_id,
        d.name,
        d.description,
        c.is_required,
        c.is_selected_by_team_lead,
        c.is_received,
        c.safe_to_dispatch_before_balance,
        c.generated_by_user_id,
        c.created_by,
        c.creation_timestamp
      FROM app_doc_checklist c
      INNER JOIN document_type d
        ON d.document_type_id = c.document_type_id
      WHERE c.application_id = $1
        AND c.discontinued_at IS NULL
      ORDER BY c.checklist_id
      `,
      [application_id],
    );

    // ---------------------------------------------------------
    // 14. Commit transaction
    // ---------------------------------------------------------
    await client.query("COMMIT");

    // ---------------------------------------------------------
    // 15. Final response
    // ---------------------------------------------------------
    return {
      application: applicationUpdateResult.rows[0],

      checklist: checklistResult.rows,

      customer_notification: {
        checklist_sent: true,
        channel: "customer",
      },

      next_step: {
        status_id: nextStatus.status_id,
        status_code: nextStatus.status_code,
        status_label: nextStatus.label,
      },

      generated_by: {
        user_id: Number(updated_by),
        role: "Team Lead",
      },
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// Team Lead: Send Document Checklist to Customer
const sendApplicationChecklistService = async (application_id, body) => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  const { updated_by } = body;

  // --------------------------------------------------
  // 1. Validate Team Lead
  // --------------------------------------------------

  if (!updated_by) {
    const error = new Error("updated_by is required");
    error.statusCode = 400;
    throw error;
  }

  const teamLeadResult = await pool.query(
    `
      SELECT
        u.user_id,
        u.first_name,
        u.last_name,
        r.role_name
      FROM s_user u
      INNER JOIN role r
        ON r.role_id = u.user_role_type_id
      WHERE u.user_id = $1
        AND r.role_name = 'Team Lead'
        AND u.is_active = 1;
    `,
    [updated_by],
  );

  if (teamLeadResult.rows.length === 0) {
    const error = new Error("Only Team Lead can send document checklist");
    error.statusCode = 403;
    throw error;
  }

  const teamLead = teamLeadResult.rows[0];

  // --------------------------------------------------
  // 2. Check Application
  // --------------------------------------------------

  const applicationResult = await pool.query(
    `
      SELECT
        a.application_id,
        a.case_id,
        a.applicant_id,
        a.status_id,
        a.risk_assessment_flag,
        a.vac_account_required,
        a.documents_checklist_sent,
        s.status_code,
        s.label AS status_label
      FROM b_applications a
      INNER JOIN app_status s
        ON s.status_id = a.status_id
      WHERE a.application_id = $1
        AND a.discontinued_at IS NULL;
    `,
    [application_id],
  );

  if (applicationResult.rows.length === 0) {
    const error = new Error("Application not found");
    error.statusCode = 404;
    throw error;
  }

  const application = applicationResult.rows[0];

  // --------------------------------------------------
  // 3. Application must be in Application Information
  //    For Review status
  // --------------------------------------------------

  if (application.status_code !== "application_information_for_review") {
    const error = new Error(
      "Application must be in Application Information For Review status",
    );
    error.statusCode = 400;
    throw error;
  }

  // --------------------------------------------------
  // 4. Check Generated Checklist
  // --------------------------------------------------

  const checklistResult = await pool.query(
    `
      SELECT
        c.checklist_id,
        c.document_type_id,
        c.is_required,
        c.is_selected_by_team_lead,
        c.is_received,
        c.safe_to_dispatch_before_balance,
        dt.name AS document_name
      FROM app_doc_checklist c
      INNER JOIN document_type dt
        ON dt.document_type_id = c.document_type_id
      WHERE c.application_id = $1
        AND c.discontinued_at IS NULL
        AND c.is_selected_by_team_lead = 1
      ORDER BY c.checklist_id;
    `,
    [application_id],
  );

  if (checklistResult.rows.length === 0) {
    const error = new Error("Document checklist has not been generated");
    error.statusCode = 400;
    throw error;
  }

  // --------------------------------------------------
  // 5. Mark Checklist as Sent
  // --------------------------------------------------

  const updateResult = await pool.query(
    `
      UPDATE b_applications
      SET
        documents_checklist_sent = 1,
        updated_by = $1,
        updation_timestamp = NOW()
      WHERE application_id = $2
      RETURNING
        application_id,
        case_id,
        applicant_id,
        status_id,
        risk_assessment_flag,
        vac_account_required,
        documents_checklist_sent,
        updated_by,
        updation_timestamp;
    `,
    [String(teamLead.user_id), application_id],
  );

  const updatedApplication = updateResult.rows[0];

  // --------------------------------------------------
  // 6. Return Response
  // --------------------------------------------------

  return {
    application: {
      ...updatedApplication,
      status_code: application.status_code,
      status_label: application.status_label,
    },

    checklist: checklistResult.rows,

    sent_by: {
      user_id: teamLead.user_id,
      name: `${teamLead.first_name || ""} ${teamLead.last_name || ""}`.trim(),
      role: teamLead.role_name,
    },

    next_status:
      Number(application.vac_account_required) === 1
        ? {
            status_id: 2,
            status_code: "vac_account_creation",
            status_label: "VAC Account Creation",
          }
        : {
            status_id: 3,
            status_code: "appointment_monitoring",
            status_label: "Appointment Monitoring",
          },
  };
};

module.exports = {
  createApplicationReviewTaskService,
  reviewApplicationService,
  getApplicationChecklistService,
  generateApplicationChecklistService,
  sendApplicationChecklistService,
};
