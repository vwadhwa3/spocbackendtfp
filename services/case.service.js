const { randomUUID } = require("node:crypto");
const { fromZonedTime, formatInTimeZone } = require("date-fns-tz");
const { getPool, getSupabase } = require("../config/database");
const { ROLES } = require("../middleware/role.middleware");
const {
  t,
  isValidDateString,
  isPositiveInt,
} = require("../utils/validate.util");
const {
  validateSubmission,
  isValidTimeZone,
  startCaseCreated,
  toCents,
  fromCents,
} = require("./deposit.service");

// SPOC Add New Case wizard. Nothing is written until the final submit, which
// creates the whole case in one database transaction.

const MAX_APPLICANTS = 10;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const NAME_MAX_LENGTH = 100;
const FULL_NAME_MAX_LENGTH = 200;
const DOCUMENT_NUMBER_MAX_LENGTH = 50;
const DOCUMENT_TYPE_MAX_LENGTH = 50;

// International format: + then country code and number, 8-15 digits (E.164).
const PHONE_RE = /^\+[1-9]\d{7,14}$/;

// b_contact.role_id points at the staff role table; every existing contact
// uses 1, so new ones do too.
const CONTACT_ROLE_ID = 1;

// The Add New Case form doesn't ask for marital status but the column is
// required; the customer's info form corrects it later.
const DEFAULT_MARITAL_STATUS_ID = 1;

// Until service_pack_pricing / add_on_pack_pricing are filled in, a pack with
// no pricing row costs its price_gbp and needs this share of it upfront.
const FALLBACK_DEPOSIT_RATE = 0.5;
const FALLBACK_CURRENCY_CODE = "GBP";

// Multipart file field for applicants[i]'s travel document.
const travelDocumentField = (i) => `travel_document_${i}`;

// Detected from the file's first bytes, not its name or declared type.
const FILE_SIGNATURES = [
  {
    ext: "pdf",
    contentType: "application/pdf",
    bytes: [0x25, 0x50, 0x44, 0x46],
  },
  { ext: "jpg", contentType: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  {
    ext: "png",
    contentType: "image/png",
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
];

const caseError = (statusCode, error, message, details) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.error = error;
  err.details = details;
  return err;
};

const validationError = (errors) =>
  caseError(400, "VALIDATION_ERROR", errors[0].message, errors);

const detectFileType = (buffer) =>
  FILE_SIGNATURES.find(
    ({ bytes }) =>
      buffer?.length >= bytes.length && bytes.every((b, i) => buffer[i] === b),
  ) ?? null;

// Drops spaces, dashes, dots and brackets: "+44 (7900) 000-000" -> "+447900000000".
const normalizePhoneInput = (value) =>
  typeof value === "string" ? value.replace(/[\s\-().]/g, "") : "";

const isValidPhone = (value) => PHONE_RE.test(normalizePhoneInput(value));

const isOptionalIdList = (value) =>
  value == null || (Array.isArray(value) && value.every(isPositiveInt));

const uniqueIds = (values) => [...new Set((values ?? []).map(Number))];

const getDb = () => {
  const pool = getPool();
  if (!pool) throw new Error("PostgreSQL pool is not available");
  return pool;
};

const getTravelDocumentsBucket = () => {
  const bucket = process.env.TRAVEL_DOCUMENTS_BUCKET;
  if (!bucket) throw new Error("TRAVEL_DOCUMENTS_BUCKET is not configured");
  return bucket;
};

/* ===================== VALIDATION ===================== */

// Returns a list of { field, message }; empty when the submission is valid.
// Only checks the shape of the body; ids are checked against the database in
// checkReferences.
const validateCaseCreation = (body, files = []) => {
  const errors = [];
  const add = (field, message) => errors.push({ field, message });
  const { timezone, lead, applicants, payments } = body ?? {};

  // Dates are judged by the SPOC's calendar day. A bad timezone is reported
  // with the payments below.
  const today =
    typeof timezone === "string" && isValidTimeZone(timezone)
      ? formatInTimeZone(new Date(), timezone, "yyyy-MM-dd")
      : null;

  // ---- Customer Lead Information ----
  const l = lead ?? {};
  const fullName = t(l.full_name);
  if (!fullName) {
    add("lead.full_name", "Full name is required");
  } else if (fullName.length > FULL_NAME_MAX_LENGTH) {
    add(
      "lead.full_name",
      `Full name must be at most ${FULL_NAME_MAX_LENGTH} characters`,
    );
  }

  if (!isValidPhone(l.whatsapp_number)) {
    add(
      "lead.whatsapp_number",
      "WhatsApp number is required with country code, e.g. +447900000000",
    );
  }

  [
    ["destination_country_id", "Destination country is required"],
    ["application_city_id", "Application city is required"],
    ["visa_category_id", "Visa category is required"],
    ["assigned_csr_user_id", "Assigned CSR is required"],
    ["assigned_team_lead_user_id", "Assigned team lead is required"],
  ].forEach(([key, message]) => {
    if (!isPositiveInt(l[key])) add(`lead.${key}`, message);
  });

  if (!isValidDateString(l.tentative_travel_date)) {
    add(
      "lead.tentative_travel_date",
      "Tentative travel date is required, format YYYY-MM-DD",
    );
  } else if (today && l.tentative_travel_date <= today) {
    add(
      "lead.tentative_travel_date",
      "Tentative travel date must be in the future",
    );
  }

  if (
    !Array.isArray(l.service_pack_ids) ||
    l.service_pack_ids.length === 0 ||
    !isOptionalIdList(l.service_pack_ids)
  ) {
    add("lead.service_pack_ids", "At least one service pack is required");
  }

  if (!isOptionalIdList(l.add_on_pack_ids)) {
    add("lead.add_on_pack_ids", "Add-on packs must be a list of ids");
  }

  // ---- Applicant Details ----
  if (!Array.isArray(applicants) || applicants.length === 0) {
    add("applicants", "At least one applicant is required");
  } else if (applicants.length > MAX_APPLICANTS) {
    add("applicants", `At most ${MAX_APPLICANTS} applicants per case`);
  } else {
    const documentNumbers = new Set();

    applicants.forEach((applicant, i) => {
      const field = (name) => `applicants[${i}].${name}`;
      const a = applicant ?? {};

      [
        ["first_name", "First name"],
        ["surname", "Surname"],
      ].forEach(([key, label]) => {
        const value = t(a[key]);
        if (!value) add(field(key), `${label} is required`);
        else if (value.length > NAME_MAX_LENGTH) {
          add(
            field(key),
            `${label} must be at most ${NAME_MAX_LENGTH} characters`,
          );
        }
      });

      [
        ["gender_id", "Sex is required"],
        ["nationality_id", "Nationality is required"],
        ["place_of_birth_id", "Place of birth is required"],
      ].forEach(([key, message]) => {
        if (!isPositiveInt(a[key])) add(field(key), message);
      });

      if (a.marital_status_id != null && !isPositiveInt(a.marital_status_id)) {
        add(field("marital_status_id"), "Marital status is invalid");
      }

      if (!isValidDateString(a.date_of_birth)) {
        add(
          field("date_of_birth"),
          "Date of birth is required, format YYYY-MM-DD",
        );
      } else if (today && a.date_of_birth >= today) {
        add(field("date_of_birth"), "Date of birth must be in the past");
      }

      const documentType = t(a.travel_document_type);
      if (!documentType || documentType.length > DOCUMENT_TYPE_MAX_LENGTH) {
        add(field("travel_document_type"), "Travel document type is required");
      }

      const documentNumber = t(a.travel_document_number);
      if (!documentNumber) {
        add(
          field("travel_document_number"),
          "Travel document number is required",
        );
      } else if (documentNumber.length > DOCUMENT_NUMBER_MAX_LENGTH) {
        add(
          field("travel_document_number"),
          `Travel document number must be at most ${DOCUMENT_NUMBER_MAX_LENGTH} characters`,
        );
      } else if (documentNumbers.has(documentNumber.toUpperCase())) {
        add(
          field("travel_document_number"),
          "Travel document number is repeated",
        );
      }
      if (documentNumber) documentNumbers.add(documentNumber.toUpperCase());

      const issueOk = isValidDateString(a.issue_date);
      if (!issueOk) {
        add(field("issue_date"), "Issue date is required, format YYYY-MM-DD");
      } else if (today && a.issue_date > today) {
        add(field("issue_date"), "Issue date cannot be in the future");
      }

      if (!isValidDateString(a.expiry_date)) {
        add(field("expiry_date"), "Expiry date is required, format YYYY-MM-DD");
      } else if (issueOk && a.expiry_date <= a.issue_date) {
        add(field("expiry_date"), "Expiry date must be after the issue date");
      } else if (today && a.expiry_date <= today) {
        add(field("expiry_date"), "Travel document has expired");
      }

      if (!isValidPhone(a.phone_number)) {
        add(
          field("phone_number"),
          "Phone number is required with country code, e.g. +447900000000",
        );
      }

      const file = files.find((f) => f.fieldname === travelDocumentField(i));
      if (!file) {
        add(field("travel_document"), "Travel document upload is required");
      } else if (file.size > MAX_FILE_BYTES) {
        add(field("travel_document"), "Travel document must be at most 10MB");
      } else if (!detectFileType(file.buffer)) {
        add(
          field("travel_document"),
          "Travel document must be a PDF, JPG or PNG",
        );
      }
    });

    const expected = new Set(applicants.map((_, i) => travelDocumentField(i)));
    files
      .filter((f) => !expected.has(f.fieldname))
      .forEach((f) => add(f.fieldname, "Unexpected file"));
  }

  // ---- Payment ---- (same rules as Submit Initial Deposit)
  errors.push(...validateSubmission({ timezone, payments }));

  return errors;
};

// The validated body with ids as numbers, strings trimmed and phones normalized.
const toCaseInput = ({ timezone, lead, applicants, payments }) => ({
  timezone,
  lead: {
    full_name: t(lead.full_name),
    whatsapp_number: normalizePhoneInput(lead.whatsapp_number),
    destination_country_id: Number(lead.destination_country_id),
    application_city_id: Number(lead.application_city_id),
    tentative_travel_date: lead.tentative_travel_date,
    visa_category_id: Number(lead.visa_category_id),
    service_pack_ids: uniqueIds(lead.service_pack_ids),
    add_on_pack_ids: uniqueIds(lead.add_on_pack_ids),
    assigned_csr_user_id: Number(lead.assigned_csr_user_id),
    assigned_team_lead_user_id: Number(lead.assigned_team_lead_user_id),
  },
  applicants: applicants.map((a) => ({
    first_name: t(a.first_name),
    surname: t(a.surname),
    gender_id: Number(a.gender_id),
    date_of_birth: a.date_of_birth,
    travel_document_type: t(a.travel_document_type),
    travel_document_number: t(a.travel_document_number),
    issue_date: a.issue_date,
    expiry_date: a.expiry_date,
    nationality_id: Number(a.nationality_id),
    place_of_birth_id: Number(a.place_of_birth_id),
    marital_status_id: Number(a.marital_status_id ?? DEFAULT_MARITAL_STATUS_ID),
    phone_number: normalizePhoneInput(a.phone_number),
  })),
  payments: payments.map((p) => ({
    amount_cents: toCents(p.amount),
    bank_account_id: p.bank_account_id,
    local_payment_datetime: p.local_payment_datetime,
    payment_timestamp_utc: fromZonedTime(
      p.local_payment_datetime,
      timezone,
    ).toISOString(),
    payment_reference: p.payment_reference.trim(),
  })),
});

/* ===================== MINIMUM DEPOSIT ===================== */

// The pricing row that applies today. A null country (or service pack, for
// add-ons) means "any"; the most specific match wins.
const PRICING_FILTER = `
  is_active = 1
  and discontinued_at is null
  and (valid_from_date is null or valid_from_date <= current_date)
  and (valid_to_date is null or valid_to_date >= current_date)
  and (destination_country_id is null or destination_country_id = $2)
  and (application_country_id is null or application_country_id = $3)`;

const SERVICE_PACK_PRICING_SQL = `
  select sp.service_pack_id as pack_id, sp.name, sp.price_gbp,
         p.price, p.upfront_price, p.currency_id
  from service_pack sp
  left join lateral (
    select price, upfront_price, currency_id
    from service_pack_pricing
    where service_pack_id = sp.service_pack_id and ${PRICING_FILTER}
    order by (destination_country_id is not null) desc,
             (application_country_id is not null) desc,
             pricing_id desc
    limit 1
  ) p on true
  where sp.service_pack_id = any($1::int[])
    and sp.active = 1
    and sp.discontinued_at is null`;

const ADD_ON_PACK_PRICING_SQL = `
  select ap.add_on_pack_id as pack_id, ap.name, ap.price_gbp,
         p.price, p.upfront_price, p.currency_id
  from add_on_pack ap
  left join lateral (
    select price, upfront_price, currency_id
    from add_on_pack_pricing
    where add_on_pack_id = ap.add_on_pack_id
      and (service_pack_id is null or service_pack_id = any($4::int[]))
      and ${PRICING_FILTER}
    order by (service_pack_id is not null) desc,
             (destination_country_id is not null) desc,
             (application_country_id is not null) desc,
             addon_pricing_id desc
    limit 1
  ) p on true
  where ap.add_on_pack_id = any($1::int[])
    and ap.active = 1
    and ap.discontinued_at is null`;

// One quote line per booked pack, in integer cents.
const toQuoteLine = (row, packType, fallbackCurrencyId) => {
  const base = { pack_type: packType, pack_id: row.pack_id, name: row.name };

  if (row.currency_id != null) {
    return {
      ...base,
      currency_id: row.currency_id,
      priceCents: toCents(row.price),
      upfrontCents: toCents(row.upfront_price),
      pricing_source: "pricing",
    };
  }

  const priceCents = toCents(row.price_gbp);
  return {
    ...base,
    currency_id: fallbackCurrencyId,
    priceCents,
    upfrontCents: Math.round(priceCents * FALLBACK_DEPOSIT_RATE),
    pricing_source: "fallback",
  };
};

// Payments are compared with the minimum, so every pack must be priced in one
// currency.
const summarizeQuote = (lines) => {
  if (new Set(lines.map((l) => l.currency_id)).size !== 1) {
    throw caseError(
      422,
      "MIXED_PRICING_CURRENCY",
      "The selected packs are priced in different currencies",
    );
  }

  return {
    currency_id: lines[0].currency_id,
    minimumCents: lines.reduce((sum, l) => sum + l.upfrontCents, 0),
    totalCents: lines.reduce((sum, l) => sum + l.priceCents, 0),
    lines,
  };
};

// Throws 400 when a pack is unknown or inactive.
const quoteDeposit = async (
  db,
  { destinationCountryId, applicationCountryId, servicePackIds, addOnPackIds },
) => {
  const params = [destinationCountryId, applicationCountryId];
  const [{ rows: serviceRows }, { rows: addOnRows }] = await Promise.all([
    db.query(SERVICE_PACK_PRICING_SQL, [servicePackIds, ...params]),
    db.query(ADD_ON_PACK_PRICING_SQL, [
      addOnPackIds,
      ...params,
      servicePackIds,
    ]),
  ]);

  const errors = [];
  const reportMissing = (field, ids, rows) => {
    const found = new Set(rows.map((r) => r.pack_id));
    ids
      .filter((id) => !found.has(id))
      .forEach((id) =>
        errors.push({ field, message: `Pack ${id} not found or inactive` }),
      );
  };
  reportMissing("lead.service_pack_ids", servicePackIds, serviceRows);
  reportMissing("lead.add_on_pack_ids", addOnPackIds, addOnRows);
  if (errors.length > 0) throw validationError(errors);

  let fallbackCurrencyId = null;
  if ([...serviceRows, ...addOnRows].some((r) => r.currency_id == null)) {
    const { rows } = await db.query(
      "select currency_id from currency where iso_code = $1 and discontinued_at is null",
      [FALLBACK_CURRENCY_CODE],
    );
    if (!rows[0])
      throw new Error(`currency '${FALLBACK_CURRENCY_CODE}' is not configured`);
    fallbackCurrencyId = rows[0].currency_id;
  }

  return summarizeQuote([
    ...serviceRows.map((r) => toQuoteLine(r, "service", fallbackCurrencyId)),
    ...addOnRows.map((r) => toQuoteLine(r, "addon", fallbackCurrencyId)),
  ]);
};

// Application city must be in the destination country; returns its country.
const getApplicationCountryId = async (db, cityId, destinationCountryId) => {
  const { rows } = await db.query(
    "select country_id from city where city_id = $1",
    [cityId],
  );
  if (!rows[0]) return { error: "Application city not found" };
  if (rows[0].country_id !== destinationCountryId) {
    return { error: "Application city must be in the destination country" };
  }
  return { countryId: rows[0].country_id };
};

const getCurrencyCode = async (db, currencyId) => {
  const { rows } = await db.query(
    "select iso_code from currency where currency_id = $1",
    [currencyId],
  );
  return rows[0]?.iso_code ?? null;
};

const formatQuote = (quote, currencyCode) => ({
  currency_id: quote.currency_id,
  currency_code: currencyCode,
  minimum_deposit_amount: fromCents(quote.minimumCents),
  total_price: fromCents(quote.totalCents),
  packs: quote.lines.map((l) => ({
    pack_type: l.pack_type,
    pack_id: l.pack_id,
    name: l.name,
    price: fromCents(l.priceCents),
    upfront_amount: fromCents(l.upfrontCents),
    pricing_source: l.pricing_source,
  })),
});

// "1,3" or ["1", "3"] -> [1, 3]; throws 400 on anything else.
const parseIdList = (value, field, { required = false } = {}) => {
  const parts = (Array.isArray(value) ? value.join(",") : String(value ?? ""))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!parts.every(isPositiveInt) || (required && parts.length === 0)) {
    throw caseError(
      400,
      "VALIDATION_ERROR",
      `${field} must be a comma-separated list of ids${required ? " with at least one id" : ""}`,
    );
  }
  return uniqueIds(parts);
};

const parseId = (value, field) => {
  if (!isPositiveInt(value)) {
    throw caseError(
      400,
      "VALIDATION_ERROR",
      `${field} must be a positive integer`,
    );
  }
  return Number(value);
};

// Get Minimum Deposit
//
// Step 2 shows this before anything is saved; create-full recalculates it the
// same way, so the two always agree.
const getMinimumDepositService = async (query) => {
  const destinationCountryId = parseId(
    query.destination_country_id,
    "destination_country_id",
  );
  const applicationCityId = parseId(
    query.application_city_id,
    "application_city_id",
  );
  const servicePackIds = parseIdList(
    query.service_pack_ids,
    "service_pack_ids",
    {
      required: true,
    },
  );
  const addOnPackIds = parseIdList(query.add_on_pack_ids, "add_on_pack_ids");

  const db = getDb();
  const city = await getApplicationCountryId(
    db,
    applicationCityId,
    destinationCountryId,
  );
  if (city.error) throw caseError(400, "VALIDATION_ERROR", city.error);

  const quote = await quoteDeposit(db, {
    destinationCountryId,
    applicationCountryId: city.countryId,
    servicePackIds,
    addOnPackIds,
  });

  return formatQuote(quote, await getCurrencyCode(db, quote.currency_id));
};

// Deposit at or above the minimum opens the case straight away; a shortfall
// waits for a Lead Consultant in Deposit Amount Review.
const decideDeposit = (totalCents, minimumCents) => {
  const meetsMinimum = totalCents >= minimumCents;
  return {
    meetsMinimum,
    statusCode: meetsMinimum ? "case_created" : "deposit_amount_review",
    paymentStatus: meetsMinimum ? "approved" : "pending",
  };
};

/* ===================== DATABASE CHECKS ===================== */

const idSet = async (db, sql, params) =>
  new Set((await db.query(sql, params)).rows.map((r) => r.id));

// Checks every id and uniqueness rule against the database. Read-only.
// Returns a list of { field, message }.
const checkReferences = async (db, { lead, applicants, payments }) => {
  const errors = [];
  const add = (field, message) => errors.push({ field, message });
  const distinct = (key) => [...new Set(applicants.map((a) => a[key]))];

  const activeUserWithRole = (userId, roleId) =>
    db
      .query(
        `select 1 from s_user where user_id = $1 and user_role_type_id = $2
         and is_active = 1 and discontinued_at is null`,
        [userId, roleId],
      )
      .then((r) => r.rowCount > 0);

  const [
    destinationOk,
    city,
    visaCategoryOk,
    csrOk,
    teamLeadOk,
    genderIds,
    countryIds,
    cityIds,
    maritalIds,
    documentTypes,
    whatsappTaken,
    takenReferences,
    banks,
  ] = await Promise.all([
    db
      .query(
        "select 1 from country where country_id = $1 and is_active = 1 and discontinued_at is null",
        [lead.destination_country_id],
      )
      .then((r) => r.rowCount > 0),
    getApplicationCountryId(
      db,
      lead.application_city_id,
      lead.destination_country_id,
    ),
    db
      .query("select 1 from visa_category where visa_category_id = $1", [
        lead.visa_category_id,
      ])
      .then((r) => r.rowCount > 0),
    activeUserWithRole(lead.assigned_csr_user_id, ROLES.CSR),
    activeUserWithRole(lead.assigned_team_lead_user_id, ROLES.TEAM_LEAD),
    idSet(
      db,
      "select gender_id as id from gender where gender_id = any($1::int[])",
      [distinct("gender_id")],
    ),
    idSet(
      db,
      "select country_id as id from country where country_id = any($1::int[]) and discontinued_at is null",
      [distinct("nationality_id")],
    ),
    idSet(db, "select city_id as id from city where city_id = any($1::int[])", [
      distinct("place_of_birth_id"),
    ]),
    idSet(
      db,
      "select marital_status_id as id from marital_status where marital_status_id = any($1::int[])",
      [distinct("marital_status_id")],
    ),
    idSet(
      db,
      "select code as id from travel_doc_type where code = any($1::text[]) and discontinued_at is null",
      [distinct("travel_document_type")],
    ),
    // Stored numbers come in mixed formats, so compare digits only.
    db
      .query(
        `select 1 from b_contact
         where regexp_replace(whatsapp_number, '\\D', '', 'g') = $1 limit 1`,
        [lead.whatsapp_number.slice(1)],
      )
      .then((r) => r.rowCount > 0),
    db
      .query(
        `select payment_reference as id from payment where payment_reference = any($1::text[])
         union
         select payment_reference from "transaction" where payment_reference = any($1::text[])`,
        [payments.map((p) => p.payment_reference)],
      )
      .then((r) => new Set(r.rows.map((row) => row.id))),
    db
      .query(
        `select bank_account_id, currency_id from bank_account
         where bank_account_id = any($1::int[]) and enabled = 1 and discontinued_at is null`,
        [payments.map((p) => p.bank_account_id)],
      )
      .then(
        (r) => new Map(r.rows.map((b) => [b.bank_account_id, b.currency_id])),
      ),
  ]);

  if (!destinationOk)
    add(
      "lead.destination_country_id",
      "Destination country not found or inactive",
    );
  if (city.error) add("lead.application_city_id", city.error);
  if (!visaCategoryOk) add("lead.visa_category_id", "Visa category not found");
  if (!csrOk)
    add("lead.assigned_csr_user_id", "Assigned CSR must be an active CSR");
  if (!teamLeadOk) {
    add(
      "lead.assigned_team_lead_user_id",
      "Assigned team lead must be an active Team Lead",
    );
  }
  if (whatsappTaken) {
    add(
      "lead.whatsapp_number",
      "This WhatsApp number already belongs to another customer",
    );
  }

  applicants.forEach((a, i) => {
    const field = (name) => `applicants[${i}].${name}`;
    if (!genderIds.has(a.gender_id)) add(field("gender_id"), "Sex not found");
    if (!countryIds.has(a.nationality_id))
      add(field("nationality_id"), "Nationality not found");
    if (!cityIds.has(a.place_of_birth_id))
      add(field("place_of_birth_id"), "Place of birth not found");
    if (!maritalIds.has(a.marital_status_id)) {
      add(field("marital_status_id"), "Marital status not found");
    }
    if (!documentTypes.has(a.travel_document_type)) {
      add(field("travel_document_type"), "Travel document type not found");
    }
  });

  payments.forEach((p, i) => {
    if (!banks.has(p.bank_account_id)) {
      add(
        `payments[${i}].bank_account_id`,
        "Bank account not found or disabled",
      );
    }
    if (takenReferences.has(p.payment_reference)) {
      add(
        `payments[${i}].payment_reference`,
        "This payment reference is already used",
      );
    }
  });

  return { errors, applicationCountryId: city.countryId, bankCurrency: banks };
};

// Status, task and transaction type ids the case needs; a missing one is a
// configuration problem, not a user error.
const loadConfig = async (db) => {
  const [caseStatuses, appStatus, transactionType, depositReview] =
    await Promise.all([
      db.query(
        `select status_code, status_id, label from case_status
       where status_code = any($1::text[]) and is_active = 1 and discontinued_at is null`,
        [["pending_initial_deposit", "case_created", "deposit_amount_review"]],
      ),
      db.query(
        `select status_id from app_status
       where status_code = 'created' and is_active = 1 and discontinued_at is null`,
      ),
      db.query(
        `select transaction_type_id from transaction_type
       where type_code = 'initial_deposit' and is_active = 1`,
      ),
      db.query(
        `select task_type_id from s_task
       where task_type_code = 'DepositReview' and is_active = 1 and discontinued_at is null`,
      ),
    ]);

  const caseStatus = new Map(caseStatuses.rows.map((r) => [r.status_code, r]));
  const required = (value, name) => {
    if (value == null) throw new Error(`${name} is not configured`);
    return value;
  };

  return {
    caseStatus: (code) =>
      required(caseStatus.get(code), `case_status '${code}'`),
    applicationCreatedId: required(
      appStatus.rows[0]?.status_id,
      "app_status 'created'",
    ),
    initialDepositTypeId: required(
      transactionType.rows[0]?.transaction_type_id,
      "transaction_type 'initial_deposit'",
    ),
    depositReviewTaskTypeId: required(
      depositReview.rows[0]?.task_type_id,
      "s_task 'DepositReview'",
    ),
  };
};

/* ===================== WRITES ===================== */

// Table and column names come from this file only, never from the request.
const insertRow = async (client, table, row, returning) => {
  const columns = Object.keys(row);
  const { rows } = await client.query(
    `insert into "${table}" (${columns.join(", ")})
     values (${columns.map((_, i) => `$${i + 1}`).join(", ")})
     returning ${returning}`,
    Object.values(row),
  );
  return rows[0];
};

const uploadTravelDocuments = async (files) => {
  const storage = getSupabase().storage.from(getTravelDocumentsBucket());
  const paths = [];

  try {
    for (const file of files) {
      const { ext, contentType } = detectFileType(file.buffer);
      const path = `travel-documents/${randomUUID()}.${ext}`;
      const { error } = await storage.upload(path, file.buffer, {
        contentType,
        upsert: false,
      });
      if (error) throw error;
      paths.push(path);
    }
  } catch (error) {
    await removeTravelDocuments(paths);
    throw error;
  }

  return paths;
};

const removeTravelDocuments = async (paths) => {
  if (paths.length === 0) return;
  const { error } = await getSupabase()
    .storage.from(getTravelDocumentsBucket())
    .remove(paths);
  if (error) console.error("Travel document cleanup failed:", error);
};

// A unique index caught a duplicate that another request saved after our checks.
const toConflictError = (error) => {
  if (error.code !== "23505") return error;
  if (error.constraint === "b_contact_whatsapp_number_key") {
    return caseError(
      409,
      "DUPLICATE_WHATSAPP_NUMBER",
      "This WhatsApp number already belongs to another customer",
    );
  }
  if (error.constraint?.endsWith("payment_reference_key")) {
    return caseError(
      409,
      "DUPLICATE_PAYMENT_REFERENCE",
      "A payment with this reference already exists",
    );
  }
  return error;
};

// Create Full Case
//
// Called once, on "confirm & submit". All checks run first; then the travel
// documents are uploaded and every row is written in one transaction, so a
// failure leaves nothing behind.
const createFullCaseService = async (body, files, userId) => {
  const shapeErrors = validateCaseCreation(body, files);
  if (shapeErrors.length > 0) throw validationError(shapeErrors);

  const input = toCaseInput(body);
  const { lead, applicants, payments } = input;
  const db = getDb();
  const actor = String(userId);

  // ---- Checks (no writes) ----
  const refs = await checkReferences(db, input);
  if (refs.errors.length > 0) throw validationError(refs.errors);

  const quote = await quoteDeposit(db, {
    destinationCountryId: lead.destination_country_id,
    applicationCountryId: refs.applicationCountryId,
    servicePackIds: lead.service_pack_ids,
    addOnPackIds: lead.add_on_pack_ids,
  });

  // Payments are compared with the minimum, so they must share its currency.
  const currencyErrors = payments
    .map((p, i) => ({ p, i }))
    .filter(
      ({ p }) => refs.bankCurrency.get(p.bank_account_id) !== quote.currency_id,
    )
    .map(({ i }) => ({
      field: `payments[${i}].bank_account_id`,
      message: "Bank account currency does not match the case currency",
    }));
  if (currencyErrors.length > 0) throw validationError(currencyErrors);

  const [config, currencyCode] = await Promise.all([
    loadConfig(db),
    getCurrencyCode(db, quote.currency_id),
  ]);

  const totalCents = payments.reduce((sum, p) => sum + p.amount_cents, 0);
  const { meetsMinimum, statusCode, paymentStatus } = decideDeposit(
    totalCents,
    quote.minimumCents,
  );
  const pendingStatus = config.caseStatus("pending_initial_deposit");
  const finalStatus = config.caseStatus(statusCode);

  // ---- Writes ----
  const orderedFiles = applicants.map((_, i) =>
    files.find((f) => f.fieldname === travelDocumentField(i)),
  );
  const documentPaths = await uploadTravelDocuments(orderedFiles);

  let client;
  let created;

  try {
    client = await db.connect();
    await client.query("BEGIN");

    const contactRow = (a, i, caseId) => ({
      case_id: caseId,
      role_id: CONTACT_ROLE_ID,
      first_name: a.first_name,
      surname: a.surname,
      gender_id: a.gender_id,
      date_of_birth: a.date_of_birth,
      place_of_birth_id: a.place_of_birth_id,
      marital_status_id: a.marital_status_id,
      // Only the lead is reached on WhatsApp; the column is unique.
      whatsapp_number: i === 0 ? lead.whatsapp_number : null,
      phone_number: a.phone_number,
      travel_document_type: a.travel_document_type,
      travel_document_number: a.travel_document_number,
      issue_date: a.issue_date,
      expiry_date: a.expiry_date,
      travel_document_file_path: documentPaths[i],
      nationality_id: a.nationality_id,
      created_by: actor,
    });

    // 1. Lead contact. b_case needs it first, so it starts without a case.
    const leadContact = await insertRow(
      client,
      "b_contact",
      contactRow(applicants[0], 0, null),
      "contact_id",
    );
    const leadContactId = Number(leadContact.contact_id);

    // 2. Case, waiting for its initial deposit.
    const bCase = await insertRow(
      client,
      "b_case",
      {
        lead_contact_id: leadContactId,
        application_city_id: lead.application_city_id,
        destination_country_id: lead.destination_country_id,
        application_country_id: refs.applicationCountryId,
        tentative_travel_date: lead.tentative_travel_date,
        visa_category_id: lead.visa_category_id,
        status_id: pendingStatus.status_id,
        minimum_deposit_amount: fromCents(quote.minimumCents),
        currency_id: quote.currency_id,
        assigned_csr_user_id: lead.assigned_csr_user_id,
        assigned_team_lead_user_id: lead.assigned_team_lead_user_id,
        created_by: actor,
      },
      "case_id",
    );
    const caseId = Number(bCase.case_id);

    // 3. Close the loop: the lead now belongs to the case.
    await client.query(
      "update b_contact set case_id = $1 where contact_id = $2",
      [caseId, leadContactId],
    );

    // 4. The other applicants.
    const contactIds = [leadContactId];
    for (let i = 1; i < applicants.length; i++) {
      const row = await insertRow(
        client,
        "b_contact",
        contactRow(applicants[i], i, caseId),
        "contact_id",
      );
      contactIds.push(Number(row.contact_id));
    }

    // 5. Link each applicant to the case, lead first.
    for (const [i, applicantId] of contactIds.entries()) {
      await insertRow(
        client,
        "b_case_application",
        {
          case_id: caseId,
          applicant_id: applicantId,
          relationship_to_lead: i === 0 ? "self" : "co_applicant",
          sequence_number: i + 1,
          created_by_user_id: userId,
          created_by: actor,
        },
        "applicant_id",
      );
    }

    // 6. One application per applicant.
    const applicationIds = [];
    for (const applicantId of contactIds) {
      const row = await insertRow(
        client,
        "b_applications",
        {
          case_id: caseId,
          applicant_id: applicantId,
          status_id: config.applicationCreatedId,
          created_by_user_id: userId,
          created_by: actor,
        },
        "application_id",
      );
      applicationIds.push(Number(row.application_id));
    }

    // 7. Booked packs, at today's price.
    for (const line of quote.lines) {
      await insertRow(
        client,
        "b_case_service_pack",
        {
          case_id: caseId,
          pack_type: line.pack_type,
          pack_id: line.pack_id,
          price_at_booking: fromCents(line.priceCents),
          created_by_user_id: userId,
          created_by: actor,
        },
        "pack_id",
      );
    }

    // 8. Each payment, plus its ledger entry.
    const createdPayments = [];
    for (const p of payments) {
      const payment = await insertRow(
        client,
        "payment",
        {
          case_id: caseId,
          bank_account_id: p.bank_account_id,
          amount: fromCents(p.amount_cents),
          currency_id: quote.currency_id,
          type: "initial_deposit",
          local_payment_datetime: p.local_payment_datetime,
          payment_timestamp_utc: p.payment_timestamp_utc,
          payment_reference: p.payment_reference,
          created_by_user_id: userId,
          // A shortfall stays pending until a Lead Consultant decides it.
          status: paymentStatus,
          created_by: actor,
        },
        "payment_id, status",
      );
      const transaction = await insertRow(
        client,
        "transaction",
        {
          case_id: caseId,
          transaction_type: "initial_deposit",
          transaction_type_id: config.initialDepositTypeId,
          amount: fromCents(p.amount_cents),
          currency_id: quote.currency_id,
          bank_account_id: p.bank_account_id,
          payment_reference: p.payment_reference,
          transaction_date_local: p.local_payment_datetime,
          transaction_date_utc: p.payment_timestamp_utc,
          // transaction.status_id points at case_status: the case's status
          // once this payment is recorded.
          status_id: finalStatus.status_id,
          entered_by_user_id: userId,
          created_by: actor,
        },
        "transaction_id",
      );
      createdPayments.push({
        payment_id: Number(payment.payment_id),
        transaction_id: Number(transaction.transaction_id),
        amount: fromCents(p.amount_cents),
        bank_account_id: p.bank_account_id,
        payment_reference: p.payment_reference,
        local_payment_datetime: p.local_payment_datetime,
        payment_timestamp_utc: p.payment_timestamp_utc,
        status: payment.status,
      });
    }

    // 9. Deposit decides the status: enough -> Case Created; short -> Deposit
    //    Amount Review with a task for a Lead Consultant.
    await client.query(
      `update b_case set status_id = $1, initial_deposit_received = $2,
       updated_by = $3, updation_timestamp = now() where case_id = $4`,
      [finalStatus.status_id, fromCents(totalCents), actor, caseId],
    );

    let reviewTask = null;
    if (!meetsMinimum) {
      reviewTask = await insertRow(
        client,
        "task",
        {
          case_id: caseId,
          task_type_id: config.depositReviewTaskTypeId,
          role_required: "Lead Consultant",
          status: "pending",
          description: `Review initial deposit of ${fromCents(totalCents)} ${currencyCode} against the minimum of ${fromCents(quote.minimumCents)}`,
          created_by_user_id: userId,
          created_by: actor,
        },
        "task_id, status, description",
      );
      reviewTask.task_id = Number(reviewTask.task_id);
    }

    await client.query("COMMIT");

    created = {
      caseId,
      contactIds,
      applicationIds,
      createdPayments,
      reviewTask,
    };
  } catch (error) {
    await client
      ?.query("ROLLBACK")
      .catch((rollbackError) =>
        console.error("Case create rollback failed:", rollbackError),
      );
    await removeTravelDocuments(documentPaths);
    throw toConflictError(error);
  } finally {
    client?.release();
  }

  // Same follow-up as Submit Initial Deposit: open the info form stage. The
  // case is saved by now, so a failure is reported, not undone;
  // POST /api/cases/:caseId/info-form/start retries.
  const caseCreated = meetsMinimum
    ? await startCaseCreated(created.caseId, totalCents, userId)
    : { applications: [], info_form: null, info_form_error: null };

  return {
    case_id: created.caseId,
    status_code: finalStatus.status_code,
    status_label: finalStatus.label,
    lead_contact_id: created.contactIds[0],
    lead_full_name: lead.full_name,
    whatsapp_number: lead.whatsapp_number,
    destination_country_id: lead.destination_country_id,
    application_country_id: refs.applicationCountryId,
    application_city_id: lead.application_city_id,
    tentative_travel_date: lead.tentative_travel_date,
    visa_category_id: lead.visa_category_id,
    assigned_csr_user_id: lead.assigned_csr_user_id,
    assigned_team_lead_user_id: lead.assigned_team_lead_user_id,
    ...formatQuote(quote, currencyCode),
    total_paid: fromCents(totalCents),
    shortfall: fromCents(Math.max(0, quote.minimumCents - totalCents)),
    applicants: applicants.map((a, i) => ({
      contact_id: created.contactIds[i],
      application_id: created.applicationIds[i],
      relationship_to_lead: i === 0 ? "self" : "co_applicant",
      sequence_number: i + 1,
      first_name: a.first_name,
      surname: a.surname,
      travel_document_file_path: documentPaths[i],
    })),
    payments: created.createdPayments,
    review_task: created.reviewTask,
    deposit_split: caseCreated.applications,
    info_form: caseCreated.info_form,
    info_form_error: caseCreated.info_form_error,
  };
};

module.exports = {
  createFullCaseService,
  getMinimumDepositService,
  validateCaseCreation,
  decideDeposit,
  detectFileType,
  normalizePhoneInput,
  toQuoteLine,
  summarizeQuote,
  parseIdList,
  travelDocumentField,
  MAX_APPLICANTS,
  MAX_FILE_BYTES,
};
