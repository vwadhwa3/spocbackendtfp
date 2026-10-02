const { getPool } = require("../../config/database");
const { sendEmailWithAttachments } = require("../../utils/email.util");

const CUSTOMER_LEAD_APPROVED_STATUS_ID = 29;
const AWAITING_BALANCE_PAYMENT_STATUS_ID = 30;

const sendSafeToDispatchDocumentsService = async (applicationId) => {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Get application + customer details
    const applicationResult = await client.query(
      `
      SELECT
        a.application_id,
        a.case_id,
        a.applicant_id,
        a.status_id,
        c.first_name,
        c.surname,
        c.email
      FROM b_applications a
      INNER JOIN b_contact c
        ON c.contact_id = a.applicant_id
      WHERE a.application_id = $1
        AND a.discontinued_at IS NULL
      `,
      [applicationId],
    );

    if (applicationResult.rows.length === 0) {
      throw new Error("Application not found.");
    }

    const application = applicationResult.rows[0];

    // 2. Validate current application status
    if (Number(application.status_id) !== CUSTOMER_LEAD_APPROVED_STATUS_ID) {
      throw new Error("Application is not in Customer Lead Approved status.");
    }

    // 3. Validate customer email
    if (!application.email) {
      throw new Error("Customer email address is not available.");
    }

    // 4. Fetch only safe-to-dispatch documents
    const checklistResult = await client.query(
      `
      SELECT
        checklist_id,
        application_id,
        document_type_id,
        file_path,
        safe_to_dispatch_before_balance
      FROM app_doc_checklist
      WHERE application_id = $1
        AND safe_to_dispatch_before_balance = 1
        AND discontinued_at IS NULL
      ORDER BY checklist_id
      `,
      [applicationId],
    );

    if (checklistResult.rows.length === 0) {
      throw new Error(
        "No documents are marked safe to dispatch before balance payment.",
      );
    }

    // 5. Find matching attachments
    const attachments = [];

    for (const checklistDocument of checklistResult.rows) {
      const attachmentResult = await client.query(
        `
        SELECT
          attachment_id,
          document_type_id,
          file_name,
          file_path,
          url_path,
          blob_data
        FROM attachment
        WHERE application_id = $1
          AND document_type_id = $2
          AND discontinued_at IS NULL
        ORDER BY attachment_id DESC
        LIMIT 1
        `,
        [applicationId, checklistDocument.document_type_id],
      );

      if (attachmentResult.rows.length === 0) {
        continue;
      }

      const attachment = attachmentResult.rows[0];

      const emailAttachment = {
        filename: attachment.file_name,
      };

      // Prefer blob_data when available
      if (attachment.blob_data) {
        emailAttachment.content = attachment.blob_data;
      } else if (attachment.file_path) {
        emailAttachment.path = attachment.file_path;
      } else if (attachment.url_path) {
        emailAttachment.path = attachment.url_path;
      } else {
        continue;
      }

      attachments.push(emailAttachment);
    }

    if (attachments.length === 0) {
      throw new Error(
        "No matching document attachments found for safe-to-dispatch documents.",
      );
    }

    // 6. Send documents via email
    await sendEmailWithAttachments({
      to: application.email,
      subject: "Your Documents Are Ready",
      text: `Dear ${application.first_name}${
        application.surname ? ` ${application.surname}` : ""
      },

Your approved documents that are eligible for dispatch before balance payment are attached to this email.

Please review the attached documents.

Regards,
The Flying Panda`,
      attachments,
    });

    // 7. Move application to Awaiting Balance Payment
    await client.query(
      `
      UPDATE b_applications
      SET
        status_id = $1,
        updated_by = 'system',
        updation_timestamp = NOW()
      WHERE application_id = $2
      `,
      [AWAITING_BALANCE_PAYMENT_STATUS_ID, applicationId],
    );

    await client.query("COMMIT");

    return {
      application_id: application.application_id,
      case_id: application.case_id,
      applicant_id: application.applicant_id,
      previous_status_id: CUSTOMER_LEAD_APPROVED_STATUS_ID,
      new_status_id: AWAITING_BALANCE_PAYMENT_STATUS_ID,
      customer_email: application.email,
      documents_sent: attachments.length,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  sendSafeToDispatchDocumentsService,
};
