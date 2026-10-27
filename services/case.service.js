const { randomUUID } = require("node:crypto");
const { fromZonedTime, formatInTimeZone } = require("date-fns-tz");
const {
  db: connectDatabases,
  getPool,
  getSupabase,
} = require("../config/database");
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
  APPLICATION_STATUS_BY_CASE_STATUS,
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

// If the startup connection test failed, config/database.js leaves no pool
// and nothing retries it; try setting it up again before giving up.
const getDb = async () => {
  if (!getPool()) await connectDatabases();
  const pool = getPool();
  if (!pool) throw new Error("PostgreSQL pool is not available");
  return pool;
};

// Runs fn with one pooled connection. Queries fired together on one client
// queue up on it; on the pool, each opens its own connection to the remote
// pooler, and a burst of them hit connectionTimeoutMillis.
const withClient = async (fn) => {
  const client = await (await getDb()).connect();
  let broken;
  try {
    return await fn(client);
  } catch (error) {
    // A database failure may have left the connection unusable, so it is
    // dropped instead of going back to the pool. Request errors keep it.
    if (!error.statusCode) broken = error;
    throw error;
  } finally {
    client.release(broken);
  }
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

// Every applicant books the same packs, so the case pays the per-application
// quote once per applicant.
const forApplicants = (quote, applicantCount) => ({
  ...quote,
  applicantCount,
  perApplication: {
    minimumCents: quote.minimumCents,
    totalCents: quote.totalCents,
  },
  minimumCents: quote.minimumCents * applicantCount,
  totalCents: quote.totalCents * applicantCount,
});

// One b_application_service_pack row per application and booked pack, at
// today's price. Each application carries the full price of its packs.
const applicationPackRows = (applicationIds, lines, userId, actor) =>
  applicationIds.flatMap((applicationId) =>
    lines.map((line) => ({
      application_id: applicationId,
      pack_type: line.pack_type,
      pack_id: line.pack_id,
      price_at_booking: fromCents(line.priceCents),
      created_by_user_id: userId,
      created_by: actor,
    })),
  );

// Throws 400 when a pack is unknown or inactive. The quote is for one
// application; forApplicants scales it to the case.
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

// Totals are for the whole case; pack prices are per application.
const formatQuote = (quote, currencyCode) => ({
  currency_id: quote.currency_id,
  currency_code: currencyCode,
  applicant_count: quote.applicantCount,
  minimum_deposit_amount: fromCents(quote.minimumCents),
  total_price: fromCents(quote.totalCents),
  per_application_minimum_deposit: fromCents(quote.perApplication.minimumCents),
  per_application_total_price: fromCents(quote.perApplication.totalCents),
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

// Optional; the wizard sends how many applicants it has so far.
const parseApplicantCount = (value) => {
  if (value == null || value === "") return 1;
  const count = parseId(value, "applicant_count");
  if (count > MAX_APPLICANTS) {
    throw caseError(
      400,
      "VALIDATION_ERROR",
      `applicant_count must be at most ${MAX_APPLICANTS}`,
    );
  }
  return count;
};

// Get Minimum Deposit
//
// Step 2 shows this before anything is saved; create-full recalculates it the
// same way, so the two agree when applicant_count matches the applicants sent.
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
  const applicantCount = parseApplicantCount(query.applicant_count);

  return withClient(async (db) => {
    const city = await getApplicationCountryId(
      db,
      applicationCityId,
      destinationCountryId,
    );
    if (city.error) throw caseError(400, "VALIDATION_ERROR", city.error);

    const quote = forApplicants(
      await quoteDeposit(db, {
        destinationCountryId,
        applicationCountryId: city.countryId,
        servicePackIds,
        addOnPackIds,
      }),
      applicantCount,
    );

    return formatQuote(quote, await getCurrencyCode(db, quote.currency_id));
  });
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

/* ===================== LIST ===================== */

// Every open case with the names the SPOC case list and dashboard show, plus
// each applicant's application status (the dashboard's stages). Read-only.
// Dates are cast to text so the pg driver doesn't shift them by timezone.
// Older cases have no destination on b_case; for those it comes from the first
// applicant's travel info (destination_preferences holds either a country id or,
// in the legacy shape, the country's name).
const LIST_CASES_SQL = `
  select c.case_id,
         c.lead_contact_id,
         lc.whatsapp_number as lead_whatsapp_number,
         lc.first_name as lead_first_name,
         lc.surname as lead_surname,
         (select count(*)::int from b_case_application ca
          where ca.case_id = c.case_id and ca.discontinued_at is null) as applicant_count,
         city.name as application_city,
         coalesce(dc.name, pref.destination_country) as destination_country,
         vc.name as visa_category,
         c.tentative_travel_date::text as tentative_travel_date,
         nullif(concat_ws(' ', csr.first_name, csr.last_name), '') as assigned_csr,
         nullif(concat_ws(' ', tl.first_name, tl.last_name), '') as assigned_team_lead,
         cs.status_code,
         cs.label as status_label,
         coalesce(c.updation_timestamp, c.creation_timestamp) as updated_at,
         (select coalesce(json_agg(json_build_object(
                   'application_id', a.application_id,
                   'first_name', ac.first_name,
                   'surname', ac.surname,
                   'status_code', s.status_code,
                   'status_label', s.label,
                   'is_terminal', s.is_terminal
                 ) order by ca.sequence_number nulls last, a.application_id), '[]'::json)
          from b_applications a
          left join b_contact ac on ac.contact_id = a.applicant_id
          left join app_status s on s.status_id = a.status_id
          left join b_case_application ca
            on ca.case_id = a.case_id and ca.applicant_id = a.applicant_id
           and ca.discontinued_at is null
          where a.case_id = c.case_id and a.discontinued_at is null) as applications
  from b_case c
  left join b_contact lc on lc.contact_id = c.lead_contact_id
  left join city on city.city_id = c.application_city_id
  left join country dc on dc.country_id = c.destination_country_id
  left join lateral (
    select coalesce(pc.name, ti.destination_preferences->0->>'destinationCountry') as destination_country
    from b_applications a
    join application_form f on f.application_id = a.application_id and f.discontinued_at is null
    join travel_info ti on ti.form_id = f.form_id and ti.discontinued_at is null
    left join country pc
      on pc.country_id = (ti.destination_preferences->0->>'destination_country_id')::int
    where a.case_id = c.case_id and a.discontinued_at is null
    order by a.application_id
    limit 1
  ) pref on c.destination_country_id is null
  left join visa_category vc on vc.visa_category_id = c.visa_category_id
  left join s_user csr on csr.user_id = c.assigned_csr_user_id
  left join s_user tl on tl.user_id = c.assigned_team_lead_user_id
  left join case_status cs on cs.status_id = c.status_id
  where c.discontinued_at is null
  order by updated_at desc nulls last, c.case_id desc`;

// List Cases
const listCasesService = async () =>
  (await (await getDb()).query(LIST_CASES_SQL)).rows;

/* ===================== CUSTOMER DETAIL ===================== */

// The Directory's customer page: the case a customer lead belongs to, its
// packs and every applicant's details. Read-only. Payments come from
// GET /api/cases/:caseId/deposit/payments.

const CUSTOMER_CASE_SQL = `
  select c.case_id,
         c.lead_contact_id,
         lc.first_name as lead_first_name,
         lc.surname as lead_surname,
         lc.whatsapp_number as lead_whatsapp_number,
         city.name as application_city,
         dc.name as destination_country,
         vc.name as visa_category,
         c.tentative_travel_date::text as tentative_travel_date,
         nullif(concat_ws(' ', csr.first_name, csr.last_name), '') as assigned_csr,
         nullif(concat_ws(' ', tl.first_name, tl.last_name), '') as assigned_team_lead,
         cs.status_code,
         cs.label as status_label,
         c.minimum_deposit_amount,
         cur.iso_code as currency_code
  from b_case c
  left join b_contact lc on lc.contact_id = c.lead_contact_id
  left join city on city.city_id = c.application_city_id
  left join country dc on dc.country_id = c.destination_country_id
  left join visa_category vc on vc.visa_category_id = c.visa_category_id
  left join s_user csr on csr.user_id = c.assigned_csr_user_id
  left join s_user tl on tl.user_id = c.assigned_team_lead_user_id
  left join case_status cs on cs.status_id = c.status_id
  left join currency cur on cur.currency_id = c.currency_id
  where c.lead_contact_id = $1 and c.discontinued_at is null
  order by c.case_id desc
  limit 1`;

const CUSTOMER_PACKS_SQL = `
  select bp.pack_type, coalesce(sp.name, ap.name) as name,
         bp.price_at_booking
  from b_case_service_pack bp
  left join service_pack sp
    on bp.pack_type = 'service' and sp.service_pack_id = bp.pack_id
  left join add_on_pack ap
    on bp.pack_type = 'addon' and ap.add_on_pack_id = bp.pack_id
  where bp.case_id = $1
  order by bp.pack_type desc, name`;

// What the case costs: every application's packs. Cases created before packs
// were booked per application paid for the case's packs once.
const CUSTOMER_TOTAL_PRICE_SQL = `
  select coalesce(
    (select sum(ap.price_at_booking)
     from b_application_service_pack ap
     join b_applications a on a.application_id = ap.application_id
     where a.case_id = $1 and a.discontinued_at is null
       and ap.discontinued_at is null),
    (select sum(price_at_booking) from b_case_service_pack
     where case_id = $1 and discontinued_at is null),
    0) as total_price`;

// One row per applicant: their contact details plus each section of their
// info form (null until the customer fills it in). Dates are cast to text so
// the pg driver doesn't shift them by timezone.
const CUSTOMER_APPLICANTS_SQL = `
  select a.application_id,
         a.vac_account_required,
         a.vac_alias,
         a.vac_password,
         (select sum(ap.price_at_booking)::float8
          from b_application_service_pack ap
          where ap.application_id = a.application_id
            and ap.discontinued_at is null) as total_price,
         s.label as status_label,
         f.form_id,
         ct.first_name,
         ct.surname,
         ct.had_different_name,
         ct.previous_name,
         ct.date_of_birth::text as date_of_birth,
         ct.phone_number,
         ct.whatsapp_number,
         ct.email,
         pob.name as place_of_birth,
         coalesce(cob.name, pobc.name) as country_of_birth,
         nat.name as nationality,
         g.label as gender,
         ms.label as marital_status,
         tdt.label as travel_document_type,
         ct.travel_document_number,
         ct.issue_date::text as issue_date,
         ct.expiry_date::text as expiry_date,
         (select json_build_object(
                   'postcode', ai.postcode,
                   'address_line1', ai.address_line1,
                   'address_line2', ai.address_line2,
                   'city', ai.city,
                   'county', ai.county,
                   'country', aic.name,
                   'mobile_number', ai.mobile_number,
                   'whatsapp_number', ai.whatsapp_number,
                   'email', ai.email)
          from address_info ai
          left join country aic on aic.country_id = ai.country_id
          where ai.form_id = f.form_id and ai.discontinued_at is null
          order by ai.address_info_id desc limit 1) as address,
         (select json_build_object(
                   'permit_type', pt.label,
                   'permit_number', rp.permit_number,
                   'issue_date', rp.issue_date::text,
                   'expiry_date', rp.expiry_date::text,
                   'issuing_country', rpc.name)
          from residence_permit rp
          left join permit_type pt on pt.permit_type_id = rp.permit_type_id
          left join country rpc on rpc.country_id = rp.issuing_country_id
          where rp.form_id = f.form_id and rp.discontinued_at is null
          order by rp.residence_permit_id desc limit 1) as residence_permit,
         (select json_build_object(
                   'occupation', coalesce(oc.label, oi.occupation_category),
                   'employer_name', oi.employer_name,
                   'job_title', oi.job_title,
                   'start_date', oi.start_date::text,
                   'employer_address', oi.employer_address,
                   'employer_email', oi.employer_email,
                   'employer_phone', oi.employer_phone,
                   'gross_annual_earnings', oi.gross_annual_earnings)
          from occupation_info oi
          left join occupation_category oc on oc.code = oi.occupation_category
          where oi.form_id = f.form_id and oi.discontinued_at is null
          order by oi.occupation_info_id desc limit 1) as occupation,
         (select json_build_object(
                   'had_schengen_visa_last_59_months', vh.had_schengen_visa_last_59_months,
                   'previous_biometrics_date', vh.previous_biometrics_date::text,
                   'visa_sticker_number', vh.visa_sticker_number,
                   'visa_valid_from', vh.visa_valid_from::text,
                   'visa_valid_to', vh.visa_valid_to::text,
                   'issuing_country', vhc.name)
          from visa_history vh
          left join country vhc on vhc.country_id = vh.issuing_country_id
          where vh.form_id = f.form_id and vh.discontinued_at is null
          order by vh.visa_history_id desc limit 1) as visa_history,
         (select json_build_object(
                   'funding_source', coalesce(fs.label, fi.funding_source),
                   'sponsor_first_name', fi.sponsor_first_name,
                   'sponsor_surname', fi.sponsor_surname,
                   'sponsor_gender', fi.sponsor_gender,
                   'sponsor_address', fi.sponsor_address,
                   'sponsor_country', fic.name,
                   'sponsor_contact_number', fi.sponsor_contact_number,
                   'sponsor_email', fi.sponsor_email,
                   'sponsor_occupation', coalesce(foc.label, fi.sponsor_occupation_category),
                   'joins_eu_family_member', fi.joins_eu_family_member)
          from financing_info fi
          left join funding_source fs on fs.code = fi.funding_source
          left join country fic on fic.country_id = fi.sponsor_country_id
          left join occupation_category foc on foc.code = fi.sponsor_occupation_category
          where fi.form_id = f.form_id and fi.discontinued_at is null
          order by fi.financing_info_id desc limit 1) as financing,
         (select oth.notes
          from other_info oth
          where oth.form_id = f.form_id and oth.discontinued_at is null
          order by oth.other_info_id desc limit 1) as other_notes,
         (select coalesce(vcat.name, ti.visa_type)
          from travel_info ti
          left join visa_category vcat on vcat.code = ti.visa_type
          where ti.form_id = f.form_id and ti.discontinued_at is null
          order by ti.travel_info_id desc limit 1) as travel_visa_type
  from b_applications a
  join b_contact ct on ct.contact_id = a.applicant_id
  left join b_case_application ca
    on ca.case_id = a.case_id and ca.applicant_id = a.applicant_id
   and ca.discontinued_at is null
  left join lateral (
    select form_id from application_form
    where application_id = a.application_id and discontinued_at is null
    order by form_id desc limit 1
  ) f on true
  left join city pob on pob.city_id = ct.place_of_birth_id
  left join country pobc on pobc.country_id = pob.country_id
  left join country cob on cob.country_id = ct.country_of_birth_id
  left join country nat on nat.country_id = ct.nationality_id
  left join gender g on g.gender_id = ct.gender_id
  left join marital_status ms on ms.marital_status_id = ct.marital_status_id
  left join travel_doc_type tdt on tdt.code = ct.travel_document_type
  left join app_status s on s.status_id = a.status_id
  where a.case_id = $1 and a.discontinued_at is null
  order by ca.sequence_number nulls last, a.application_id`;

// Documents for the case, newest first: uploads in attachment, plus the
// travel document each applicant's contact got on Add New Case (stored on
// b_contact, not in attachment). Listing only: the files aren't served.
const CUSTOMER_DOCUMENTS_SQL = `
  select * from (
    select 'attachment-' || at.attachment_id as document_key,
           at.application_id,
           coalesce(dt.name, at.file_name) as document_name,
           dc.name as document_category,
           case when at.uploaded_by_customer = 1
                then nullif(concat_ws(' ', uc.first_name, uc.surname), '')
                else nullif(concat_ws(' ', u.first_name, u.last_name), '')
           end as uploader,
           at.uploaded_at
    from attachment at
    left join document_type dt on dt.document_type_id = at.document_type_id
    left join document_category dc on dc.document_category_id = dt.document_category_id
    left join s_user u on u.user_id = at.uploaded_by_user_id
    left join b_applications ua on ua.application_id = at.application_id
    left join b_contact uc on uc.contact_id = ua.applicant_id
    where at.case_id = $1 and at.discontinued_at is null

    union all

    select 'travel-document-' || ct.contact_id,
           a.application_id,
           concat(coalesce(tdt.label, 'Travel document'), ' (',
                  concat_ws(' ', ct.first_name, ct.surname), ')'),
           'Travel document',
           nullif(concat_ws(' ', u.first_name, u.last_name), ''),
           ct.creation_timestamp
    from b_applications a
    join b_contact ct on ct.contact_id = a.applicant_id
    left join travel_doc_type tdt on tdt.code = ct.travel_document_type
    left join s_user u on u.user_id::text = ct.created_by
    where a.case_id = $1 and a.discontinued_at is null
      and ct.discontinued_at is null
      and ct.travel_document_file_path is not null
  ) documents
  order by uploaded_at desc nulls last, document_key`;

// Get Customer
const getCustomerService = async (contactIdParam) => {
  const contactId = parseId(contactIdParam, "contactId");

  return withClient(async (db) => {
    const { rows } = await db.query(CUSTOMER_CASE_SQL, [contactId]);
    if (!rows[0]) {
      throw caseError(404, "CUSTOMER_NOT_FOUND", "Customer not found");
    }
    const bCase = rows[0];
    const rowsOf = async (sql) => (await db.query(sql, [bCase.case_id])).rows;

    const packs = (await rowsOf(CUSTOMER_PACKS_SQL)).map((p) => ({
      ...p,
      price_at_booking:
        p.price_at_booking == null ? null : Number(p.price_at_booking),
    }));
    const [{ total_price }] = await rowsOf(CUSTOMER_TOTAL_PRICE_SQL);
    const applicants = await rowsOf(CUSTOMER_APPLICANTS_SQL);
    const documents = await rowsOf(CUSTOMER_DOCUMENTS_SQL);

    return {
      ...bCase,
      minimum_deposit_amount:
        bCase.minimum_deposit_amount == null
          ? null
          : Number(bCase.minimum_deposit_amount),
      packs,
      // What's left after payments is the balance due. Packs are listed once,
      // at their per-application price.
      total_price: Number(total_price),
      applicants,
      documents,
    };
  });
};

/* ===================== DOCUMENT LINK ===================== */

// How long a document link works, in seconds. Short, because anyone holding
// the link can open the file.
const DOCUMENT_LINK_SECONDS = 300;

// Keys as listed by CUSTOMER_DOCUMENTS_SQL.
const DOCUMENT_KEY_RE = /^(travel-document|attachment)-(\d+)$/;

const isUrl = (value) => /^https?:\/\//i.test(value ?? "");

// Where the file lives: a storage path for travel documents, a ready URL for
// attachments that have one.
const findDocumentFile = async (kind, id) =>
  withClient(async (db) => {
    if (kind === "travel-document") {
      const { rows } = await db.query(
        `select travel_document_file_path as path, first_name, surname
         from b_contact where contact_id = $1 and discontinued_at is null`,
        [id],
      );
      return rows[0]?.path ? rows[0] : null;
    }
    const { rows } = await db.query(
      `select url_path as path from attachment
       where attachment_id = $1 and discontinued_at is null`,
      [id],
    );
    return rows[0] ?? null;
  });

// Get Document Link
//
// A short-lived link to view (or, with download, save) one document from the
// customer page. Travel documents sit in a private storage bucket, so the
// link is signed; the file is never proxied through this server.
const getDocumentLinkService = async (
  documentKey,
  { download = false } = {},
) => {
  const match = DOCUMENT_KEY_RE.exec(String(documentKey ?? ""));
  if (!match) throw caseError(400, "VALIDATION_ERROR", "Unknown document");
  const [, kind, id] = match;

  const file = await findDocumentFile(kind, Number(id));
  if (!file) throw caseError(404, "DOCUMENT_NOT_FOUND", "Document not found");
  if (isUrl(file.path)) return { url: file.path, expires_in: null };
  if (kind !== "travel-document" || !file.path) {
    throw caseError(
      404,
      "DOCUMENT_FILE_UNAVAILABLE",
      "This document's file isn't available to view",
    );
  }

  // Saved as e.g. "Emma Carter travel document.pdf" instead of the random
  // storage name.
  const ext = file.path.split(".").pop();
  const fileName = `${[file.first_name, file.surname].filter(Boolean).join(" ") || "Travel"} travel document.${ext}`;

  const { data, error } = await getSupabase()
    .storage.from(getTravelDocumentsBucket())
    .createSignedUrl(
      file.path,
      DOCUMENT_LINK_SECONDS,
      download ? { download: fileName } : undefined,
    );
  if (error) throw error;

  return { url: data.signedUrl, expires_in: DOCUMENT_LINK_SECONDS };
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
  const [caseStatuses, appStatuses, transactionType, depositReview] =
    await Promise.all([
      db.query(
        `select status_code, status_id, label from case_status
       where status_code = any($1::text[]) and is_active = 1 and discontinued_at is null`,
        [Object.keys(APPLICATION_STATUS_BY_CASE_STATUS)],
      ),
      db.query(
        `select status_code, status_id from app_status
       where status_code = any($1::text[]) and is_active = 1 and discontinued_at is null`,
        [Object.values(APPLICATION_STATUS_BY_CASE_STATUS)],
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
  const appStatus = new Map(appStatuses.rows.map((r) => [r.status_code, r]));
  const required = (value, name) => {
    if (value == null) throw new Error(`${name} is not configured`);
    return value;
  };

  return {
    caseStatus: (code) =>
      required(caseStatus.get(code), `case_status '${code}'`),
    // The application status that goes with a case status.
    applicationStatus: (caseStatusCode) => {
      const code = APPLICATION_STATUS_BY_CASE_STATUS[caseStatusCode];
      return required(appStatus.get(code), `app_status '${code}'`);
    },
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
// failure leaves nothing behind. Checks and writes share one connection.
const createFullCaseService = async (body, files, userId) => {
  const shapeErrors = validateCaseCreation(body, files);
  if (shapeErrors.length > 0) throw validationError(shapeErrors);

  const input = toCaseInput(body);
  return withClient((db) => createFullCase(db, input, files, userId));
};

const createFullCase = async (db, input, files, userId) => {
  const { lead, applicants, payments } = input;
  const actor = String(userId);

  // ---- Checks (no writes) ----
  const refs = await checkReferences(db, input);
  if (refs.errors.length > 0) throw validationError(refs.errors);

  const quote = forApplicants(
    await quoteDeposit(db, {
      destinationCountryId: lead.destination_country_id,
      applicationCountryId: refs.applicationCountryId,
      servicePackIds: lead.service_pack_ids,
      addOnPackIds: lead.add_on_pack_ids,
    }),
    applicants.length,
  );

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
  const pendingApplicationStatus = config.applicationStatus(
    "pending_initial_deposit",
  );
  const finalApplicationStatus = config.applicationStatus(statusCode);

  // ---- Writes ----
  const orderedFiles = applicants.map((_, i) =>
    files.find((f) => f.fieldname === travelDocumentField(i)),
  );
  const documentPaths = await uploadTravelDocuments(orderedFiles);

  // The transaction runs on the connection the checks used.
  const client = db;
  let created;

  try {
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

    // 6. One application per applicant, waiting for the deposit like the case.
    const applicationIds = [];
    for (const applicantId of contactIds) {
      const row = await insertRow(
        client,
        "b_applications",
        {
          case_id: caseId,
          applicant_id: applicantId,
          status_id: pendingApplicationStatus.status_id,
          created_by_user_id: userId,
          created_by: actor,
        },
        "application_id",
      );
      applicationIds.push(Number(row.application_id));
    }

    // 7. Booked packs, at today's price: the SPOC's selection on the case,
    //    then a copy for each application, which its balance is worked out
    //    from.
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
    for (const row of applicationPackRows(
      applicationIds,
      quote.lines,
      userId,
      actor,
    )) {
      await insertRow(client, "b_application_service_pack", row, "pack_id");
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
    //    Amount Review with a task for a Lead Consultant. The applications
    //    follow the case.
    await client.query(
      `update b_case set status_id = $1, initial_deposit_received = $2,
       updated_by = $3, updation_timestamp = now() where case_id = $4`,
      [finalStatus.status_id, fromCents(totalCents), actor, caseId],
    );
    await client.query(
      `update b_applications set status_id = $1, updated_by = $2,
       updation_timestamp = now() where case_id = $3 and discontinued_at is null`,
      [finalApplicationStatus.status_id, actor, caseId],
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
      .query("ROLLBACK")
      .catch((rollbackError) =>
        console.error("Case create rollback failed:", rollbackError),
      );
    await removeTravelDocuments(documentPaths);
    throw toConflictError(error);
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
    application_status_code: finalApplicationStatus.status_code,
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
  listCasesService,
  getCustomerService,
  getDocumentLinkService,
  validateCaseCreation,
  decideDeposit,
  detectFileType,
  normalizePhoneInput,
  toQuoteLine,
  summarizeQuote,
  forApplicants,
  applicationPackRows,
  parseIdList,
  parseApplicantCount,
  travelDocumentField,
  MAX_APPLICANTS,
  MAX_FILE_BYTES,
};
