const { fromZonedTime } = require("date-fns-tz");
const { getSupabase } = require("../config/database");
const { startInfoFormStageService } = require("./infoForm.service");

const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;
// Wall-clock time as the SPOC sees it, no offset: 2026-09-30T14:05 or 2026-09-30T14:05:00
const LOCAL_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
const REFERENCE_MAX_LENGTH = 100;

const depositError = (statusCode, error, message, details) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.error = error;
  err.details = details;
  return err;
};

// Money is handled in integer cents so totals and splits are exact.
const toCents = (amount) => Math.round(Number(amount) * 100);
const fromCents = (cents) => cents / 100;

const isValidTimeZone = (timeZone) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
};

const isPositiveAmount = (value) =>
  AMOUNT_RE.test(String(value ?? "")) && toCents(value) > 0;

// Returns a list of { field, message }; empty when the body is valid.
const validateSubmission = ({ timezone, payments, discount }) => {
  const errors = [];
  const add = (field, message) => errors.push({ field, message });

  if (typeof timezone !== "string" || !isValidTimeZone(timezone)) {
    add("timezone", "A valid IANA timezone is required, e.g. Europe/London");
  }

  if (!Array.isArray(payments) || payments.length === 0) {
    add("payments", "At least one payment is required");
    return errors;
  }

  const references = new Set();

  payments.forEach((payment, i) => {
    const field = (name) => `payments[${i}].${name}`;
    const { amount, bank_account_id, local_payment_datetime } = payment ?? {};
    const reference = String(payment?.payment_reference ?? "").trim();

    if (!isPositiveAmount(amount)) {
      add(
        field("amount"),
        "Amount must be a positive number with at most 2 decimals",
      );
    }

    if (!Number.isInteger(bank_account_id) || bank_account_id <= 0) {
      add(field("bank_account_id"), "Bank account is required");
    }

    if (!reference) {
      add(field("payment_reference"), "Payment reference is required");
    } else if (reference.length > REFERENCE_MAX_LENGTH) {
      add(
        field("payment_reference"),
        `Payment reference must be at most ${REFERENCE_MAX_LENGTH} characters`,
      );
    } else if (references.has(reference)) {
      add(field("payment_reference"), "Payment reference is repeated");
    }
    references.add(reference);

    if (!LOCAL_DATETIME_RE.test(local_payment_datetime ?? "")) {
      add(
        field("local_payment_datetime"),
        "Payment date/time is required, format YYYY-MM-DDTHH:mm",
      );
    } else if (isValidTimeZone(timezone)) {
      const utc = fromZonedTime(local_payment_datetime, timezone);
      if (isNaN(utc)) {
        add(field("local_payment_datetime"), "Payment date/time is invalid");
      } else if (utc > new Date()) {
        add(
          field("local_payment_datetime"),
          "Payment date/time cannot be in the future",
        );
      }
    }
  });

  if (discount != null) {
    if (!isPositiveAmount(discount.amount)) {
      add(
        "discount.amount",
        "Discount must be a positive number with at most 2 decimals",
      );
    }
    if (typeof discount.reason !== "string" || !discount.reason.trim()) {
      add("discount.reason", "Discount reason is required");
    }
  }

  return errors;
};

// Splits total cents equally; leftover cents go to the first applications so
// the shares always add up to the total.
const splitEqually = (totalCents, applicationIds) => {
  const n = applicationIds.length;
  const share = Math.floor(totalCents / n);
  const remainder = totalCents - share * n;

  return applicationIds.map((application_id, i) => ({
    application_id,
    allocated_deposit_amount: fromCents(share + (i < remainder ? 1 : 0)),
  }));
};

// Unwraps a Supabase response: throws on error, returns data otherwise.
const run = async (request) => {
  const { data, error } = await request;
  if (error) throw error;
  return data;
};

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

const findCase = async (supabase, caseId) => {
  const row = await run(
    supabase
      .from("b_case")
      .select(
        "case_id, status_id, currency_id, minimum_deposit_amount, initial_deposit_received, case_status(status_code, label), currency(iso_code)",
      )
      .eq("case_id", caseId)
      .is("discontinued_at", null)
      .maybeSingle(),
  );
  if (!row) throw depositError(404, "CASE_NOT_FOUND", "Case not found");
  return row;
};

// Get Enabled Bank Accounts
const getEnabledBankAccountsService = async () => {
  const rows = await run(
    getSupabase()
      .from("bank_account")
      .select(
        "bank_account_id, account_name, bank_type, currency_id, currency(iso_code)",
      )
      .eq("enabled", 1)
      .is("discontinued_at", null)
      .order("account_name"),
  );

  return rows.map(({ currency, ...account }) => ({
    ...account,
    currency_code: currency.iso_code,
  }));
};

// Get Deposit Summary For Case
const getCaseDepositService = async (caseId) => {
  const bCase = await findCase(getSupabase(), caseId);

  return {
    case_id: bCase.case_id,
    status_code: bCase.case_status.status_code,
    status_label: bCase.case_status.label,
    minimum_deposit_amount: Number(bCase.minimum_deposit_amount),
    initial_deposit_received: Number(bCase.initial_deposit_received),
    currency_id: bCase.currency_id,
    currency_code: bCase.currency.iso_code,
  };
};

// Get Payments For Case
const getPaymentsService = async (caseId) => {
  const supabase = getSupabase();
  await findCase(supabase, caseId);

  const rows = await run(
    supabase
      .from("payment")
      .select(
        "payment_id, amount, currency_id, bank_account_id, payment_reference, local_payment_datetime, payment_timestamp_utc, type, status, created_by_user_id, creation_timestamp, bank_account(account_name)",
      )
      .eq("case_id", caseId)
      .is("discontinued_at", null)
      .order("payment_timestamp_utc"),
  );

  return rows.map(({ bank_account, ...payment }) => ({
    ...payment,
    account_name: bank_account.account_name,
  }));
};

// Runs the Case Created step and splits the deposit across the applications.
// The deposit is complete by then, so a failure here is reported rather than
// undoing it; POST /api/cases/:caseId/info-form/start retries.
// The split is returned, not stored: b_applications has no column for it.
const startCaseCreated = async (caseId, totalCents, userId) => {
  try {
    const infoForm = await startInfoFormStageService(caseId, userId);
    const ids = [...infoForm.application_ids].sort((a, b) => a - b);
    return {
      applications: ids.length ? splitEqually(totalCents, ids) : [],
      info_form: infoForm,
      info_form_error: null,
    };
  } catch (error) {
    console.error("Info form stage failed:", error);
    return {
      applications: [],
      info_form: null,
      info_form_error: error.statusCode
        ? error.message
        : "Info form setup failed",
    };
  }
};

// Submit Initial Deposit
//
// The Supabase client has no transactions, so every check runs before the
// first write, and each write registers an undo step. If a later write fails,
// the undo steps run in reverse so no partial deposit is left behind.
const submitDepositService = async (caseId, body, userId) => {
  const errors = validateSubmission(body);
  if (errors.length > 0) {
    throw depositError(400, "VALIDATION_ERROR", errors[0].message, errors);
  }

  const supabase = getSupabase();
  const { timezone, payments, discount } = body;
  const actor = String(userId);
  const now = () => new Date().toISOString();

  // ---- Checks (no writes) ----
  const bCase = await findCase(supabase, caseId);

  if (bCase.case_status.status_code !== "pending_initial_deposit") {
    throw depositError(
      409,
      "INVALID_CASE_STATUS",
      "Case is not in Pending Initial Deposit status",
    );
  }

  const banks = await run(
    supabase
      .from("bank_account")
      .select("bank_account_id, currency_id")
      .in(
        "bank_account_id",
        payments.map((p) => p.bank_account_id),
      )
      .eq("enabled", 1)
      .is("discontinued_at", null),
  );
  const bankCurrency = new Map(
    banks.map((b) => [b.bank_account_id, b.currency_id]),
  );

  payments.forEach((p, i) => {
    if (!bankCurrency.has(p.bank_account_id)) {
      throw depositError(
        400,
        "INVALID_BANK_ACCOUNT",
        `payments[${i}]: bank account not found or disabled`,
      );
    }
    // Totals are compared with the case minimum, so they must share a currency.
    if (bankCurrency.get(p.bank_account_id) !== bCase.currency_id) {
      throw depositError(
        400,
        "CURRENCY_MISMATCH",
        `payments[${i}]: bank account currency does not match the case currency`,
      );
    }
  });

  const totalCents = payments.reduce((sum, p) => sum + toCents(p.amount), 0);
  const minimumCents = toCents(bCase.minimum_deposit_amount);
  const meetsMinimum = totalCents >= minimumCents;
  const nextStatusCode = meetsMinimum
    ? "case_created"
    : "deposit_amount_review";
  const nextStatusId = await getCaseStatusId(supabase, nextStatusCode);
  const depositReviewTaskTypeId = meetsMinimum
    ? null
    : await getTaskTypeId(supabase, "DepositReview");

  // ---- Writes ----
  const undo = [];

  try {
    // Claim the case: only succeeds if it is still in its original status, so
    // two concurrent submissions can't both go through.
    const claimed = await run(
      supabase
        .from("b_case")
        .update({
          status_id: nextStatusId,
          initial_deposit_received: fromCents(totalCents),
          updated_by: actor,
          updation_timestamp: now(),
        })
        .eq("case_id", caseId)
        .eq("status_id", bCase.status_id)
        .select("case_id"),
    );
    if (claimed.length === 0) {
      throw depositError(
        409,
        "INVALID_CASE_STATUS",
        "Case is not in Pending Initial Deposit status",
      );
    }
    undo.push(() =>
      supabase
        .from("b_case")
        .update({
          status_id: bCase.status_id,
          initial_deposit_received: bCase.initial_deposit_received,
        })
        .eq("case_id", caseId),
    );

    const createdPayments = await run(
      supabase
        .from("payment")
        .insert(
          payments.map((p) => ({
            case_id: caseId,
            bank_account_id: p.bank_account_id,
            amount: fromCents(toCents(p.amount)),
            currency_id: bCase.currency_id,
            type: "initial_deposit",
            local_payment_datetime: p.local_payment_datetime,
            payment_timestamp_utc: fromZonedTime(
              p.local_payment_datetime,
              timezone,
            ).toISOString(),
            payment_reference: p.payment_reference.trim(),
            created_by_user_id: userId,
            status: meetsMinimum ? "approved" : "pending",
            created_by: actor,
          })),
        )
        .select(
          "payment_id, amount, bank_account_id, payment_reference, local_payment_datetime, payment_timestamp_utc, status",
        ),
    );
    undo.push(() =>
      supabase
        .from("payment")
        .delete()
        .in(
          "payment_id",
          createdPayments.map((p) => p.payment_id),
        ),
    );

    let createdDiscount = null;
    if (discount != null) {
      createdDiscount = await run(
        supabase
          .from("discount")
          .insert({
            case_id: caseId,
            amount: fromCents(toCents(discount.amount)),
            currency_id: bCase.currency_id,
            reason: discount.reason.trim(),
            requested_by_user_id: userId,
            status: "requested",
            created_by: actor,
          })
          .select("discount_id, amount, reason, status")
          .single(),
      );
      undo.push(() =>
        supabase
          .from("discount")
          .delete()
          .eq("discount_id", createdDiscount.discount_id),
      );
    }

    // A shortfall waits for a Lead Consultant to approve or reject it.
    let reviewTask = null;
    if (!meetsMinimum) {
      reviewTask = await run(
        supabase
          .from("task")
          .insert({
            case_id: caseId,
            task_type_id: depositReviewTaskTypeId,
            role_required: "Lead Consultant",
            status: "pending",
            description: `Review initial deposit of ${fromCents(totalCents)} ${bCase.currency.iso_code} against the minimum of ${fromCents(minimumCents)}`,
            created_by_user_id: userId,
            created_by: actor,
          })
          .select("task_id, status, description")
          .single(),
      );
    }

    const caseCreated = meetsMinimum
      ? await startCaseCreated(caseId, totalCents, userId)
      : { applications: [], info_form: null, info_form_error: null };

    return {
      case_id: caseId,
      case_status: nextStatusCode,
      total_paid: fromCents(totalCents),
      minimum_deposit_amount: fromCents(minimumCents),
      shortfall: fromCents(Math.max(0, minimumCents - totalCents)),
      payments: createdPayments,
      discount: createdDiscount,
      review_task: reviewTask,
      ...caseCreated,
    };
  } catch (error) {
    for (const step of undo.reverse()) {
      const { error: undoError } = await step();
      if (undoError) console.error("Deposit undo failed:", undoError);
    }

    if (error.code === "23505" && error.message.includes("payment_reference")) {
      throw depositError(
        409,
        "DUPLICATE_PAYMENT_REFERENCE",
        "A payment with this reference already exists",
      );
    }
    throw error;
  }
};

const REVIEW_DECISIONS = ["approve", "reject"];

// Returns a list of { field, message }; empty when the body is valid.
const validateReview = ({ decision, comments }) => {
  const errors = [];
  if (!REVIEW_DECISIONS.includes(decision)) {
    errors.push({
      field: "decision",
      message: "Decision must be approve or reject",
    });
  }
  if (comments != null && typeof comments !== "string") {
    errors.push({ field: "comments", message: "Comments must be text" });
  }
  return errors;
};

// Review Deposit Shortfall
//
// A Lead Consultant decides a deposit below the minimum. Approve accepts it
// and moves the case to Case Created; reject sends the case back to Pending
// Initial Deposit so the SPOC can enter it again. Writes are undone the same
// way as in Submit Initial Deposit.
const reviewDepositService = async (caseId, body, userId) => {
  const errors = validateReview(body);
  if (errors.length > 0) {
    throw depositError(400, "VALIDATION_ERROR", errors[0].message, errors);
  }

  const supabase = getSupabase();
  const { decision } = body;
  const approve = decision === "approve";
  const comments = body.comments?.trim() || null;
  const actor = String(userId);
  const now = () => new Date().toISOString();

  // ---- Checks (no writes) ----
  const bCase = await findCase(supabase, caseId);

  if (bCase.case_status.status_code !== "deposit_amount_review") {
    throw depositError(
      409,
      "INVALID_CASE_STATUS",
      "Case is not in Deposit Amount Review status",
    );
  }

  const pendingPayments = await run(
    supabase
      .from("payment")
      .select("payment_id, amount")
      .eq("case_id", caseId)
      .eq("type", "initial_deposit")
      .eq("status", "pending")
      .is("discontinued_at", null),
  );
  if (pendingPayments.length === 0) {
    throw depositError(
      409,
      "NO_PENDING_DEPOSIT",
      "Case has no pending deposit to review",
    );
  }

  const nextStatusCode = approve ? "case_created" : "pending_initial_deposit";
  const [nextStatusId, depositReviewTaskTypeId] = await Promise.all([
    getCaseStatusId(supabase, nextStatusCode),
    getTaskTypeId(supabase, "DepositReview"),
  ]);
  const totalCents = pendingPayments.reduce(
    (sum, p) => sum + toCents(p.amount),
    0,
  );
  const paymentIds = pendingPayments.map((p) => p.payment_id);

  // ---- Writes ----
  const undo = [];
  let payments;
  let reviewTasks;

  try {
    // Same claim as on submit, so two reviewers can't both decide.
    const claimed = await run(
      supabase
        .from("b_case")
        .update({
          status_id: nextStatusId,
          // A rejected deposit no longer counts as received.
          initial_deposit_received: approve ? fromCents(totalCents) : 0,
          updated_by: actor,
          updation_timestamp: now(),
        })
        .eq("case_id", caseId)
        .eq("status_id", bCase.status_id)
        .select("case_id"),
    );
    if (claimed.length === 0) {
      throw depositError(
        409,
        "INVALID_CASE_STATUS",
        "Case is not in Deposit Amount Review status",
      );
    }
    undo.push(() =>
      supabase
        .from("b_case")
        .update({
          status_id: bCase.status_id,
          initial_deposit_received: bCase.initial_deposit_received,
        })
        .eq("case_id", caseId),
    );

    payments = await run(
      supabase
        .from("payment")
        .update({
          status: approve ? "approved" : "rejected",
          updated_by: actor,
          updation_timestamp: now(),
        })
        .in("payment_id", paymentIds)
        .select("payment_id, amount, payment_reference, status"),
    );
    undo.push(() =>
      supabase
        .from("payment")
        .update({ status: "pending" })
        .in("payment_id", paymentIds),
    );

    reviewTasks = await run(
      supabase
        .from("task")
        .update({
          status: "completed",
          decision,
          comments,
          updated_by: actor,
          updation_timestamp: now(),
        })
        .eq("case_id", caseId)
        .eq("task_type_id", depositReviewTaskTypeId)
        .eq("status", "pending")
        .is("discontinued_at", null)
        .select("task_id, status, decision"),
    );
  } catch (error) {
    for (const step of undo.reverse()) {
      const { error: undoError } = await step();
      if (undoError) console.error("Deposit review undo failed:", undoError);
    }
    throw error;
  }

  const caseCreated = approve
    ? await startCaseCreated(caseId, totalCents, userId)
    : { applications: [], info_form: null, info_form_error: null };

  return {
    case_id: caseId,
    case_status: nextStatusCode,
    decision,
    total_paid: approve ? fromCents(totalCents) : 0,
    minimum_deposit_amount: Number(bCase.minimum_deposit_amount),
    payments,
    review_tasks: reviewTasks,
    ...caseCreated,
  };
};

module.exports = {
  getEnabledBankAccountsService,
  getCaseDepositService,
  getPaymentsService,
  submitDepositService,
  reviewDepositService,
  splitEqually,
  validateSubmission,
  validateReview,
};
