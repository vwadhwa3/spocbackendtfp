const { fromZonedTime } = require("date-fns-tz");
const { getSupabase } = require("../config/database");

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

// app_status 'Application Created' has no status_code, so it is found by label.
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
  const applicationCreatedId = meetsMinimum
    ? await getApplicationCreatedStatusId(supabase)
    : null;

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

    // The split is returned, not stored: b_applications has no column for it.
    let applications = [];
    if (meetsMinimum) {
      const updated = await run(
        supabase
          .from("b_applications")
          .update({
            status_id: applicationCreatedId,
            updated_by: actor,
            updation_timestamp: now(),
          })
          .eq("case_id", caseId)
          .is("discontinued_at", null)
          .select("application_id"),
      );
      const ids = updated.map((a) => a.application_id).sort((a, b) => a - b);
      applications = ids.length ? splitEqually(totalCents, ids) : [];
    }

    return {
      case_id: caseId,
      case_status: nextStatusCode,
      total_paid: fromCents(totalCents),
      minimum_deposit_amount: fromCents(minimumCents),
      shortfall: fromCents(Math.max(0, minimumCents - totalCents)),
      payments: createdPayments,
      discount: createdDiscount,
      applications,
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

module.exports = {
  getEnabledBankAccountsService,
  getCaseDepositService,
  getPaymentsService,
  submitDepositService,
  splitEqually,
  validateSubmission,
};
