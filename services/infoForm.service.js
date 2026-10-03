const { getSupabase } = require("../config/database");
const { signCustomerTokenService } = require("./auth.service");
const { isValidDateString } = require("../utils/validate.util");

// Case statuses during which the Customer Lead can fill info forms.
const OPEN_CASE_STATUSES = ["case_created", "case_in_progress"];
const SUBMITTABLE_FORM_STATUSES = ["draft", "reopened"];

const infoFormError = (statusCode, error, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.error = error;
  return err;
};

// Unwraps a Supabase response: throws on error, returns data otherwise.
const run = async (request) => {
  const { data, error } = await request;
  if (error) throw error;
  return data;
};

// WhatsApp numbers are stored in mixed formats (+91 98..., 9198...), so they
// are compared by digits only.
const normalizePhone = (value) => String(value ?? "").replace(/\D/g, "");

const fullName = (contact) =>
  [contact.first_name, contact.surname].filter(Boolean).join(" ");

// Lead first, then the rest by contact id, so sequence numbers are stable.
const orderApplicants = (contactIds, leadContactId) =>
  [...contactIds].sort((a, b) =>
    a === leadContactId ? -1 : b === leadContactId ? 1 : a - b,
  );

const allFormsSubmitted = (forms) =>
  forms.length > 0 && forms.every((f) => f?.status === "submitted");

const getCaseStatusId = async (supabase, statusCode) => {
  const row = await run(
    supabase
      .from("case_status")
      .select("status_id")
      .eq("status_code", statusCode)
      .eq("is_active", 1)
      .is("discontinued_at", null)
      .maybeSingle(),
  );
  if (!row) throw new Error(`case_status '${statusCode}' is not configured`);
  return row.status_id;
};

// Same status the deposit flow gives existing applications.
const getApplicationCreatedStatusId = async (supabase) => {
  const row = await run(
    supabase
      .from("app_status")
      .select("status_id")
      .eq("label", "Application Created")
      .eq("is_active", 1)
      .is("discontinued_at", null)
      .maybeSingle(),
  );
  if (!row)
    throw new Error("app_status 'Application Created' is not configured");
  return row.status_id;
};

const getTaskTypeId = async (supabase, taskTypeCode) => {
  const row = await run(
    supabase
      .from("s_task")
      .select("task_type_id")
      .eq("task_type_code", taskTypeCode)
      .eq("is_active", 1)
      .is("discontinued_at", null)
      .maybeSingle(),
  );
  if (!row) throw new Error(`s_task '${taskTypeCode}' is not configured`);
  return row.task_type_id;
};

// Common link shared with every customer; applicants are resolved after login.
const getInfoFormUrl = () => {
  const url = process.env.INFO_FORM_URL;
  if (!url) throw new Error("INFO_FORM_URL is not configured");
  return url;
};

// Customer submissions have no s_user behind them, but task.created_by_user_id
// is required, so they are recorded against a configured system user.
const getSystemUserId = () => {
  const id = Number(process.env.SYSTEM_USER_ID);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("SYSTEM_USER_ID is not configured");
  }
  return id;
};

// Start Info Form Stage
//
// Runs once the case reaches Case Created. Every step only fills in what is
// missing, so it is safe to retry after a partial failure.
const startInfoFormStageService = async (caseId, userId) => {
  const supabase = getSupabase();
  const actor = String(userId);

  // ---- Checks (no writes) ----
  const bCase = await run(
    supabase
      .from("b_case")
      .select(
        "case_id, lead_contact_id, assigned_csr_user_id, case_status(status_code)",
      )
      .eq("case_id", caseId)
      .is("discontinued_at", null)
      .maybeSingle(),
  );
  if (!bCase) throw infoFormError(404, "CASE_NOT_FOUND", "Case not found");

  if (bCase.case_status.status_code !== "case_created") {
    throw infoFormError(
      409,
      "INVALID_CASE_STATUS",
      "Case is not in Case Created status",
    );
  }

  // Packs are booked per case; every application in the case inherits them.
  const packs = await run(
    supabase
      .from("b_case_service_pack")
      .select("pack_type, pack_id")
      .eq("case_id", caseId)
      .is("discontinued_at", null),
  );
  if (!packs.some((p) => p.pack_type === "service")) {
    throw infoFormError(
      409,
      "NO_SERVICE_PACK",
      "Case has no service pack booked",
    );
  }

  const contacts = await run(
    supabase
      .from("b_contact")
      .select("contact_id")
      .eq("case_id", caseId)
      .is("discontinued_at", null),
  );
  if (contacts.length === 0) {
    throw infoFormError(409, "NO_APPLICANTS", "Case has no applicants");
  }

  const [applicationCreatedId, shareLinkTaskTypeId] = await Promise.all([
    getApplicationCreatedStatusId(supabase),
    getTaskTypeId(supabase, "ShareInfoFormLink"),
  ]);
  const infoFormUrl = getInfoFormUrl();

  const applicantIds = orderApplicants(
    contacts.map((c) => c.contact_id),
    bCase.lead_contact_id,
  );

  // ---- Writes ----
  const linked = await run(
    supabase
      .from("b_case_application")
      .select("applicant_id")
      .eq("case_id", caseId),
  );
  const linkedIds = new Set(linked.map((l) => l.applicant_id));
  const missingLinks = applicantIds
    .map((applicant_id, i) => ({ applicant_id, sequence_number: i + 1 }))
    .filter((l) => !linkedIds.has(l.applicant_id));

  if (missingLinks.length > 0) {
    await run(
      supabase.from("b_case_application").insert(
        missingLinks.map((l) => ({
          case_id: caseId,
          applicant_id: l.applicant_id,
          relationship_to_lead:
            l.applicant_id === bCase.lead_contact_id ? "self" : "co_applicant",
          sequence_number: l.sequence_number,
          created_by_user_id: userId,
          created_by: actor,
        })),
      ),
    );
  }

  const existingApps = await run(
    supabase
      .from("b_applications")
      .select("application_id, applicant_id")
      .eq("case_id", caseId),
  );
  const appByApplicant = new Map(
    existingApps.map((a) => [a.applicant_id, a.application_id]),
  );
  const missingApps = applicantIds.filter((id) => !appByApplicant.has(id));

  if (missingApps.length > 0) {
    const created = await run(
      supabase
        .from("b_applications")
        .insert(
          missingApps.map((applicant_id) => ({
            case_id: caseId,
            applicant_id,
            status_id: applicationCreatedId,
            created_by_user_id: userId,
            created_by: actor,
          })),
        )
        .select("application_id, applicant_id"),
    );
    created.forEach((a) =>
      appByApplicant.set(a.applicant_id, a.application_id),
    );
  }

  const applicationIds = applicantIds.map((id) => appByApplicant.get(id));

  const existingForms = await run(
    supabase
      .from("application_form")
      .select("application_id")
      .in("application_id", applicationIds),
  );
  const formAppIds = new Set(existingForms.map((f) => f.application_id));
  const missingForms = applicationIds.filter((id) => !formAppIds.has(id));

  if (missingForms.length > 0) {
    await run(
      supabase.from("application_form").insert(
        missingForms.map((application_id) => ({
          application_id,
          status: "draft",
          created_by_user_id: userId,
          created_by: actor,
        })),
      ),
    );
  }

  // One share-link task per case; a rejected one doesn't count.
  let shareTask = await run(
    supabase
      .from("task")
      .select("task_id, status")
      .eq("case_id", caseId)
      .eq("task_type_id", shareLinkTaskTypeId)
      .neq("status", "rejected")
      .is("discontinued_at", null)
      .limit(1)
      .maybeSingle(),
  );

  if (!shareTask) {
    shareTask = await run(
      supabase
        .from("task")
        .insert({
          case_id: caseId,
          task_type_id: shareLinkTaskTypeId,
          assigned_to_user_id: bCase.assigned_csr_user_id,
          role_required: "CSR",
          status: "pending",
          description: `Share the info form link on the case WhatsApp group: ${infoFormUrl}`,
          created_by_user_id: userId,
          created_by: actor,
        })
        .select("task_id, status")
        .single(),
    );
  }

  return {
    case_id: caseId,
    info_form_url: infoFormUrl,
    application_ids: applicationIds,
    created: {
      case_applications: missingLinks.length,
      applications: missingApps.length,
      application_forms: missingForms.length,
    },
    service_packs: packs,
    share_link_task: shareTask,
  };
};

// Customer Login
//
// The Customer Lead opens the common WATI link and identifies with their
// WhatsApp number and date of birth. The token covers every open case they
// lead.
const customerLoginService = async ({ whatsapp_number, date_of_birth }) => {
  const phone = normalizePhone(whatsapp_number);
  if (phone.length < 7 || !isValidDateString(date_of_birth)) {
    throw infoFormError(
      400,
      "VALIDATION_ERROR",
      "WhatsApp number and date of birth (YYYY-MM-DD) are required",
    );
  }

  const supabase = getSupabase();

  const contacts = await run(
    supabase
      .from("b_contact")
      .select("contact_id, whatsapp_number")
      .eq("date_of_birth", date_of_birth)
      .is("discontinued_at", null),
  );
  const matchingIds = contacts
    .filter((c) => normalizePhone(c.whatsapp_number) === phone)
    .map((c) => c.contact_id);

  const cases = matchingIds.length
    ? await run(
        supabase
          .from("b_case")
          .select("case_id, lead_contact_id, case_status!inner(status_code)")
          .in("lead_contact_id", matchingIds)
          .in("case_status.status_code", OPEN_CASE_STATUSES)
          .is("discontinued_at", null),
      )
    : [];

  // Same message whether the person is unknown or has no open case.
  if (cases.length === 0) {
    throw infoFormError(
      401,
      "INVALID_CREDENTIALS",
      "No open case found for these details",
    );
  }

  const contactIds = [...new Set(cases.map((c) => c.lead_contact_id))];
  return { token: signCustomerTokenService(contactIds) };
};

// Get Customer Cases
//
// The applicant table the Customer Lead sees: one row per applicant with the
// state of their info form.
const getCustomerCasesService = async (contactIds) => {
  const supabase = getSupabase();

  const cases = await run(
    supabase
      .from("b_case")
      .select("case_id, case_status!inner(status_code, label)")
      .in("lead_contact_id", contactIds)
      .in("case_status.status_code", OPEN_CASE_STATUSES)
      .is("discontinued_at", null)
      .order("case_id"),
  );
  if (cases.length === 0) return [];

  const caseIds = cases.map((c) => c.case_id);

  const [applications, links] = await Promise.all([
    run(
      supabase
        .from("b_applications")
        .select(
          "application_id, case_id, applicant_id, b_contact(first_name, surname), application_form(form_id, status, submitted_at)",
        )
        .in("case_id", caseIds)
        .is("discontinued_at", null),
    ),
    run(
      supabase
        .from("b_case_application")
        .select("case_id, applicant_id, relationship_to_lead, sequence_number")
        .in("case_id", caseIds)
        .is("discontinued_at", null),
    ),
  ]);

  const linkKey = (caseId, applicantId) => `${caseId}:${applicantId}`;
  const linkByKey = new Map(
    links.map((l) => [linkKey(l.case_id, l.applicant_id), l]),
  );

  return cases.map((c) => ({
    case_id: c.case_id,
    status_code: c.case_status.status_code,
    status_label: c.case_status.label,
    applicants: applications
      .filter((a) => a.case_id === c.case_id)
      .map((a) => {
        const link = linkByKey.get(linkKey(a.case_id, a.applicant_id));
        return {
          application_id: a.application_id,
          applicant_id: a.applicant_id,
          applicant_name: fullName(a.b_contact),
          relationship_to_lead: link?.relationship_to_lead ?? null,
          sequence_number: link?.sequence_number ?? null,
          form_id: a.application_form?.form_id ?? null,
          form_status: a.application_form?.status ?? null,
          submitted_at: a.application_form?.submitted_at ?? null,
        };
      })
      .sort(
        (x, y) =>
          (x.sequence_number ?? Infinity) - (y.sequence_number ?? Infinity) ||
          x.application_id - y.application_id,
      ),
  }));
};

// Submit Applicant Info Form
//
// Submits one applicant's form and creates a CSR review task for it. When the
// last applicant of the case is submitted, the case moves to Case in Progress.
const submitApplicantFormService = async (applicationId, contactIds) => {
  const supabase = getSupabase();
  const systemUserId = getSystemUserId();
  const actor = `customer:${contactIds.join(",")}`;
  const now = new Date().toISOString();

  // ---- Checks (no writes) ----
  const application = await run(
    supabase
      .from("b_applications")
      .select(
        "application_id, case_id, b_contact(first_name, surname), b_case!inner(case_id, status_id, lead_contact_id, assigned_csr_user_id, case_status(status_code)), application_form(form_id, status)",
      )
      .eq("application_id", applicationId)
      .is("discontinued_at", null)
      .maybeSingle(),
  );

  // Someone else's application is reported as missing, not forbidden.
  if (
    !application ||
    !contactIds.includes(application.b_case.lead_contact_id)
  ) {
    throw infoFormError(404, "APPLICATION_NOT_FOUND", "Application not found");
  }

  const bCase = application.b_case;
  if (!OPEN_CASE_STATUSES.includes(bCase.case_status.status_code)) {
    throw infoFormError(
      409,
      "INVALID_CASE_STATUS",
      "Info forms can't be submitted for this case",
    );
  }

  const form = application.application_form;
  if (!form) {
    throw infoFormError(404, "FORM_NOT_FOUND", "Application form not found");
  }
  if (!SUBMITTABLE_FORM_STATUSES.includes(form.status)) {
    throw infoFormError(
      409,
      "FORM_ALREADY_SUBMITTED",
      "This applicant's form is already submitted",
    );
  }

  const reviewTaskTypeId = await getTaskTypeId(supabase, "InfoFormReview");

  // ---- Writes ----
  // Conditional on the current status so a double click can't submit twice.
  const submitted = await run(
    supabase
      .from("application_form")
      .update({
        status: "submitted",
        submitted_at: now,
        updated_by: actor,
        updation_timestamp: now,
      })
      .eq("form_id", form.form_id)
      .eq("status", form.status)
      .select("form_id, status, submitted_at"),
  );
  if (submitted.length === 0) {
    throw infoFormError(
      409,
      "FORM_ALREADY_SUBMITTED",
      "This applicant's form is already submitted",
    );
  }

  let reviewTask;
  try {
    const applicantName = fullName(application.b_contact);
    reviewTask = await run(
      supabase
        .from("task")
        .insert({
          case_id: bCase.case_id,
          application_id: applicationId,
          task_type_id: reviewTaskTypeId,
          assigned_to_user_id: bCase.assigned_csr_user_id,
          role_required: "CSR",
          status: "pending",
          description: `Review Applicant Information for ${applicantName}. Application ID: ${applicationId}`,
          created_by_user_id: systemUserId,
          created_by: actor,
        })
        .select("task_id, status, description")
        .single(),
    );
  } catch (error) {
    // Without its review task the submission would go unseen, so undo it.
    const { error: undoError } = await supabase
      .from("application_form")
      .update({ status: form.status, submitted_at: null })
      .eq("form_id", form.form_id);
    if (undoError) console.error("Info form undo failed:", undoError);
    throw error;
  }

  // Each submission re-checks the whole case after its own write, so the last
  // of two concurrent submissions always sees every form submitted.
  let caseStatus = bCase.case_status.status_code;
  if (caseStatus === "case_created") {
    const caseApps = await run(
      supabase
        .from("b_applications")
        .select("application_id, application_form(status)")
        .eq("case_id", bCase.case_id)
        .is("discontinued_at", null),
    );

    if (allFormsSubmitted(caseApps.map((a) => a.application_form))) {
      const inProgressId = await getCaseStatusId(supabase, "case_in_progress");
      await run(
        supabase
          .from("b_case")
          .update({
            status_id: inProgressId,
            updated_by: actor,
            updation_timestamp: now,
          })
          .eq("case_id", bCase.case_id)
          .eq("status_id", bCase.status_id),
      );
      caseStatus = "case_in_progress";
    }
  }

  return {
    application_id: applicationId,
    form: submitted[0],
    review_task: reviewTask,
    case_id: bCase.case_id,
    case_status: caseStatus,
  };
};

module.exports = {
  startInfoFormStageService,
  customerLoginService,
  getCustomerCasesService,
  submitApplicantFormService,
  normalizePhone,
  orderApplicants,
  allFormsSubmitted,
};
