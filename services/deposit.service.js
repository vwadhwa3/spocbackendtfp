const { fromZonedTime } = require("date-fns-tz");
const { getSupabase } = require("../config/database");
const { startInfoFormStageService } = require("./infoForm.service");
const { withTransaction } = require("../utils/db.util");

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

// Splits total cents equally; leftover cents go to the first shares so they
// always add up to the total.
const equalShares = (totalCents, n) => {
  const share = Math.floor(totalCents / n);
  const remainder = totalCents - share * n;
  return Array.from({ length: n }, (_, i) => share + (i < remainder ? 1 : 0));
};

const splitEqually = (totalCents, applicationIds) => {
  const shares = equalShares(totalCents, applicationIds.length);
  return applicationIds.map((application_id, i) => ({
    application_id,
    allocated_deposit_amount: fromCents(shares[i]),
  }));
};

// Splits the deposit in proportion to what each application costs, then
// works out each one's balance. Leftover cents go to the first applications
// so the shares add up to the total. A negative balance is a credit.
const splitByPrice = (totalCents, applications) => {
  const priceCents = applications.reduce((sum, a) => sum + a.priceCents, 0);
  const shares =
    priceCents === 0
      ? equalShares(totalCents, applications.length)
      : applications.map((a) =>
          Math.floor((totalCents * a.priceCents) / priceCents),
        );
  let remainder = totalCents - shares.reduce((sum, s) => sum + s, 0);
  for (let i = 0; remainder > 0; i++, remainder--) shares[i] += 1;

  return applications.map((a, i) => ({
    application_id: a.application_id,
    total_price: fromCents(a.priceCents),
    allocated_deposit_amount: fromCents(shares[i]),
    balance_amount: fromCents(a.priceCents - shares[i]),
  }));
};

// What each application costs, in cents, from b_application_service_pack.
// Cases created before packs were booked per application paid for the case's
// packs once, shared equally between the applications.
const getApplicationPrices = async (supabase, caseId, applicationIds) => {
  const rows = await run(
    supabase
      .from("b_application_service_pack")
      .select("application_id, price_at_booking")
      .in("application_id", applicationIds)
      .is("discontinued_at", null),
  );

  if (rows.length === 0) {
    const casePacks = await run(
      supabase
        .from("b_case_service_pack")
        .select("price_at_booking")
        .eq("case_id", caseId)
        .is("discontinued_at", null),
    );
    const shares = equalShares(
      casePacks.reduce((sum, p) => sum + toCents(p.price_at_booking), 0),
      applicationIds.length,
    );
    return applicationIds.map((application_id, i) => ({
      application_id,
      priceCents: shares[i],
    }));
  }

  const priceCents = new Map(applicationIds.map((id) => [id, 0]));
  for (const row of rows) {
    priceCents.set(
      row.application_id,
      priceCents.get(row.application_id) + toCents(row.price_at_booking),
    );
  }
  return applicationIds.map((application_id) => ({
    application_id,
    priceCents: priceCents.get(application_id),
  }));
};

// The deposit is already saved, so a failure to read prices is logged and
// the split goes back to equal shares without balances.
const splitDeposit = async (caseId, totalCents, applicationIds) => {
  try {
    const applications = await getApplicationPrices(
      getSupabase(),
      caseId,
      applicationIds,
    );
    return splitByPrice(totalCents, applications);
  } catch (error) {
    console.error("Application balance failed:", error);
    return splitEqually(totalCents, applicationIds);
  }
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

// The status every application on a case takes while the case is in each
// deposit-step state; the case and its applications always change together.
const APPLICATION_STATUS_BY_CASE_STATUS = {
  pending_initial_deposit: "application_pending_initial_deposit",
  deposit_amount_review: "application_deposit_amount_review",
  case_created: "created",
};

const getAppStatusId = async (supabase, statusCode) => {
  const row = await run(
    supabase
      .from("app_status")
      .select("status_id")
      .eq("status_code", statusCode)
      .eq("is_active", 1)
      .is("discontinued_at", null)
      .maybeSingle(),
  );
  if (!row) throw new Error(`app_status '${statusCode}' is not configured`);
  return row.status_id;
};

const findApplications = (supabase, caseId) =>
  run(
    supabase
      .from("b_applications")
      .select("application_id, status_id")
      .eq("case_id", caseId)
      .is("discontinued_at", null),
  );

// Moves every application found by findApplications to one status.
const updateApplicationStatuses = async (
  supabase,
  applications,
  statusId,
  actor,
) => {
  if (applications.length === 0) return;
  await run(
    supabase
      .from("b_applications")
      .update({
        status_id: statusId,
        updated_by: actor,
        updation_timestamp: new Date().toISOString(),
      })
      .in(
        "application_id",
        applications.map((a) => a.application_id),
      ),
  );
};

// Undo step for updateApplicationStatuses: puts each application back to the
// status it had before, which may differ between applications.
const restoreApplicationStatuses = async (supabase, applications) => {
  const idsByStatus = new Map();
  for (const { application_id, status_id } of applications) {
    idsByStatus.set(status_id, [
      ...(idsByStatus.get(status_id) ?? []),
      application_id,
    ]);
  }

  const results = await Promise.all(
    [...idsByStatus].map(([status_id, ids]) =>
      supabase
        .from("b_applications")
        .update({ status_id })
        .in("application_id", ids),
    ),
  );
  return { error: results.find((r) => r.error)?.error ?? null };
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

// Runs the Case Created step and splits the deposit across the applications,
// each with the balance left on its packs. The deposit is complete by then,
// so a failure here is reported rather than undoing it;
// POST /api/cases/:caseId/info-form/start retries.
// The split is returned, not stored: b_applications has no column for it.
const startCaseCreated = async (caseId, totalCents, userId) => {
  let infoForm;
  try {
    infoForm = await startInfoFormStageService(caseId, userId);
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

  const ids = [...infoForm.application_ids].sort((a, b) => a - b);
  return {
    applications: ids.length ? await splitDeposit(caseId, totalCents, ids) : [],
    info_form: infoForm,
    info_form_error: null,
  };
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
  const nextApplicationStatusCode =
    APPLICATION_STATUS_BY_CASE_STATUS[nextStatusCode];
  const [nextApplicationStatusId, applications] = await Promise.all([
    getAppStatusId(supabase, nextApplicationStatusCode),
    findApplications(supabase, caseId),
  ]);
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

    await updateApplicationStatuses(
      supabase,
      applications,
      nextApplicationStatusId,
      actor,
    );
    undo.push(() => restoreApplicationStatuses(supabase, applications));

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
      application_status: nextApplicationStatusCode,
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

// State Machine notification N1: the SPOC hears how a shortfall was decided.
const DEPOSIT_DECISION_NOTIFICATION_CODE = "N1";

const depositDecisionMessage = (approve, leadName) =>
  approve
    ? `Deposit approved for ${leadName}.`
    : `Deposit rejected for ${leadName}. Please enter the payment again.`;

// b_case has no creator user column, only created_by (String(userId) for
// cases made through the SPOC wizard). The join leaves spoc_user_id null for
// cases created by seeds or scripts, which then have no SPOC to notify.
const REVIEW_CASE_SQL = `
  select c.case_id, c.status_id, c.minimum_deposit_amount,
         cs.status_code,
         lc.first_name as lead_first_name, lc.surname as lead_surname,
         u.user_id as spoc_user_id
  from b_case c
  join case_status cs on cs.status_id = c.status_id
  left join b_contact lc on lc.contact_id = c.lead_contact_id
  left join s_user u on u.user_id::text = c.created_by
  where c.case_id = $1 and c.discontinued_at is null
  for update of c`;

const lookupId = async (db, sql, code, name) => {
  const { rows } = await db.query(sql, [code]);
  if (!rows[0]) throw new Error(`${name} '${code}' is not configured`);
  return rows[0].id;
};

const CASE_STATUS_ID_SQL = `select status_id as id from case_status
  where status_code = $1 and is_active = 1 and discontinued_at is null`;
const APP_STATUS_ID_SQL = `select status_id as id from app_status
  where status_code = $1 and is_active = 1 and discontinued_at is null`;
const TASK_TYPE_ID_SQL = `select task_type_id as id from s_task
  where task_type_code = $1 and is_active = 1 and discontinued_at is null`;

// Review Deposit Shortfall
//
// A Lead Consultant decides a deposit below the minimum. Approve accepts it
// and moves the case to Case Created; reject sends the case back to Pending
// Initial Deposit so the SPOC can enter it again. Every application on the
// case follows the case, and the SPOC who created the case is notified. All
// of it is one transaction: if any write fails, nothing is saved, including
// the notification.
const reviewDepositService = async (caseId, body, userId) => {
  const errors = validateReview(body);
  if (errors.length > 0) {
    throw depositError(400, "VALIDATION_ERROR", errors[0].message, errors);
  }

  const { decision } = body;
  const approve = decision === "approve";
  const comments = body.comments?.trim() || null;
  const actor = String(userId);
  const nextStatusCode = approve ? "case_created" : "pending_initial_deposit";
  const nextApplicationStatusCode =
    APPLICATION_STATUS_BY_CASE_STATUS[nextStatusCode];

  const reviewed = await withTransaction(async (db) => {
    // ---- Checks (no writes) ----
    // The row lock keeps a second reviewer waiting until this one finishes,
    // after which it sees the new status and is turned away.
    const bCase = (await db.query(REVIEW_CASE_SQL, [caseId])).rows[0];
    if (!bCase) throw depositError(404, "CASE_NOT_FOUND", "Case not found");

    if (bCase.status_code !== "deposit_amount_review") {
      throw depositError(
        409,
        "INVALID_CASE_STATUS",
        "Case is not in Deposit Amount Review status",
      );
    }

    const { rows: pendingPayments } = await db.query(
      `select payment_id, amount from payment
       where case_id = $1 and type = 'initial_deposit' and status = 'pending'
         and discontinued_at is null`,
      [caseId],
    );
    if (pendingPayments.length === 0) {
      throw depositError(
        409,
        "NO_PENDING_DEPOSIT",
        "Case has no pending deposit to review",
      );
    }

    const nextStatusId = await lookupId(
      db,
      CASE_STATUS_ID_SQL,
      nextStatusCode,
      "case_status",
    );
    const nextApplicationStatusId = await lookupId(
      db,
      APP_STATUS_ID_SQL,
      nextApplicationStatusCode,
      "app_status",
    );
    const depositReviewTaskTypeId = await lookupId(
      db,
      TASK_TYPE_ID_SQL,
      "DepositReview",
      "s_task",
    );
    const totalCents = pendingPayments.reduce(
      (sum, p) => sum + toCents(p.amount),
      0,
    );

    // ---- Writes ----
    await db.query(
      `update b_case set status_id = $1, initial_deposit_received = $2,
       updated_by = $3, updation_timestamp = now() where case_id = $4`,
      // A rejected deposit no longer counts as received.
      [nextStatusId, approve ? fromCents(totalCents) : 0, actor, caseId],
    );

    await db.query(
      `update b_applications set status_id = $1, updated_by = $2,
       updation_timestamp = now() where case_id = $3 and discontinued_at is null`,
      [nextApplicationStatusId, actor, caseId],
    );

    const { rows: payments } = await db.query(
      `update payment set status = $1, updated_by = $2, updation_timestamp = now()
       where payment_id = any($3)
       returning payment_id, amount, payment_reference, status`,
      [
        approve ? "approved" : "rejected",
        actor,
        pendingPayments.map((p) => p.payment_id),
      ],
    );

    const { rows: reviewTasks } = await db.query(
      `update task set status = 'completed', decision = $1, comments = $2,
       updated_by = $3, updation_timestamp = now()
       where case_id = $4 and task_type_id = $5 and status = 'pending'
         and discontinued_at is null
       returning task_id, status, decision`,
      [decision, comments, actor, caseId, depositReviewTaskTypeId],
    );

    let notification = null;
    if (bCase.spoc_user_id == null) {
      console.warn(`Deposit review: case ${caseId} has no SPOC user to notify`);
    } else {
      const leadName =
        [bCase.lead_first_name, bCase.lead_surname].filter(Boolean).join(" ") ||
        `case ${caseId}`;
      const { rows } = await db.query(
        `insert into notification (recipient_user_id, case_id, task_id,
           notification_code, event_type, message, channel, created_by)
         values ($1, $2, $3, $4, $5, $6, 'in_app', $7)
         returning notification_id, recipient_user_id, event_type, message, channel`,
        [
          bCase.spoc_user_id,
          caseId,
          reviewTasks[0]?.task_id ?? null,
          DEPOSIT_DECISION_NOTIFICATION_CODE,
          approve ? "deposit_approved" : "deposit_rejected",
          depositDecisionMessage(approve, leadName),
          actor,
        ],
      );
      notification = {
        ...rows[0],
        notification_id: Number(rows[0].notification_id),
      };
    }

    return {
      totalCents,
      minimum: Number(bCase.minimum_deposit_amount),
      payments: payments.map((p) => ({
        ...p,
        payment_id: Number(p.payment_id),
        amount: Number(p.amount),
      })),
      reviewTasks: reviewTasks.map((t) => ({
        ...t,
        task_id: Number(t.task_id),
      })),
      notification,
    };
  });

  const caseCreated = approve
    ? await startCaseCreated(caseId, reviewed.totalCents, userId)
    : { applications: [], info_form: null, info_form_error: null };

  return {
    case_id: caseId,
    case_status: nextStatusCode,
    application_status: nextApplicationStatusCode,
    decision,
    total_paid: approve ? fromCents(reviewed.totalCents) : 0,
    minimum_deposit_amount: reviewed.minimum,
    payments: reviewed.payments,
    review_tasks: reviewed.reviewTasks,
    notification: reviewed.notification,
    ...caseCreated,
  };
};

module.exports = {
  getEnabledBankAccountsService,
  getCaseDepositService,
  getPaymentsService,
  submitDepositService,
  reviewDepositService,
  startCaseCreated,
  APPLICATION_STATUS_BY_CASE_STATUS,
  restoreApplicationStatuses,
  splitEqually,
  splitByPrice,
  getApplicationPrices,
  validateSubmission,
  validateReview,
  depositDecisionMessage,
  isValidTimeZone,
  toCents,
  fromCents,
};
