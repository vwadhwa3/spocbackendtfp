const test = require("node:test");
const assert = require("node:assert");
const {
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
  parseMyCasesQuery,
  MAX_FILE_BYTES,
} = require("../services/case.service");

const PDF = Buffer.from("%PDF-1.7 test");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]);
const EXE = Buffer.from("MZ not a document");

const file = (i, buffer = PDF, size = buffer.length) => ({
  fieldname: `travel_document_${i}`,
  buffer,
  size,
});

const applicant = (overrides = {}) => ({
  first_name: "Asha",
  surname: "Patel",
  gender_id: 2,
  date_of_birth: "1990-04-12",
  travel_document_type: "ORDINARY_PASSPORT",
  travel_document_number: "P1234567",
  issue_date: "2022-01-10",
  expiry_date: "2032-01-09",
  nationality_id: 5,
  place_of_birth_id: 1,
  phone_number: "+447900000001",
  ...overrides,
});

const validBody = () => ({
  timezone: "Europe/London",
  lead: {
    full_name: "Asha Patel",
    whatsapp_number: "+44 7900 000001",
    destination_country_id: 5,
    application_city_id: 1,
    tentative_travel_date: "2999-06-01",
    visa_category_id: 1,
    service_pack_ids: [1],
    add_on_pack_ids: [4],
    assigned_csr_user_id: 100003,
    assigned_team_lead_user_id: 100004,
  },
  applicants: [applicant()],
  payments: [
    {
      amount: "75.00",
      bank_account_id: 5,
      payment_reference: "TFP-DEP-001",
      local_payment_datetime: "2026-09-30T10:00",
    },
  ],
});

const fields = (body, files = [file(0)]) =>
  validateCaseCreation(body, files).map((e) => e.field);

test("valid submission has no errors", () => {
  assert.deepStrictEqual(validateCaseCreation(validBody(), [file(0)]), []);
});

test("every Customer Lead field is required", () => {
  const body = validBody();
  body.lead = {};
  assert.deepStrictEqual(fields(body), [
    "lead.full_name",
    "lead.whatsapp_number",
    "lead.destination_country_id",
    "lead.application_city_id",
    "lead.visa_category_id",
    "lead.assigned_csr_user_id",
    "lead.assigned_team_lead_user_id",
    "lead.tentative_travel_date",
    "lead.service_pack_ids",
  ]);
});

test("add-on packs are optional", () => {
  const body = validBody();
  delete body.lead.add_on_pack_ids;
  assert.deepStrictEqual(fields(body), []);
  body.lead.add_on_pack_ids = ["x"];
  assert.deepStrictEqual(fields(body), ["lead.add_on_pack_ids"]);
});

test("WhatsApp number needs a country code", () => {
  const body = validBody();
  body.lead.whatsapp_number = "07900000001";
  assert.deepStrictEqual(fields(body), ["lead.whatsapp_number"]);
  assert.strictEqual(
    normalizePhoneInput("+44 (7900) 000-001"),
    "+447900000001",
  );
});

test("travel date must be in the future", () => {
  const body = validBody();
  body.lead.tentative_travel_date = "2020-01-01";
  assert.deepStrictEqual(fields(body), ["lead.tentative_travel_date"]);
});

test("applicant dates: past birth, issue not future, expiry after issue and today", () => {
  const body = validBody();
  body.applicants = [
    applicant({
      date_of_birth: "2999-01-01",
      issue_date: "2999-01-01",
      expiry_date: "2998-01-01",
    }),
  ];
  assert.deepStrictEqual(fields(body), [
    "applicants[0].date_of_birth",
    "applicants[0].issue_date",
    "applicants[0].expiry_date",
  ]);

  body.applicants = [applicant({ expiry_date: "2023-01-01" })];
  assert.deepStrictEqual(
    validateCaseCreation(body, [file(0)]).map((e) => e.message),
    ["Travel document has expired"],
  );
});

test("marital status is optional but must be an id when sent", () => {
  const body = validBody();
  body.applicants[0].marital_status_id = "single";
  assert.deepStrictEqual(fields(body), ["applicants[0].marital_status_id"]);
});

test("same travel document number twice in one case is rejected", () => {
  const body = validBody();
  body.applicants.push(
    applicant({ first_name: "Ravi", travel_document_number: "p1234567" }),
  );
  assert.deepStrictEqual(fields(body, [file(0), file(1)]), [
    "applicants[1].travel_document_number",
  ]);
});

test("travel document upload: required, max 10MB, PDF/JPG/PNG by content", () => {
  const body = validBody();
  assert.deepStrictEqual(fields(body, []), ["applicants[0].travel_document"]);
  assert.deepStrictEqual(fields(body, [file(0, PDF, MAX_FILE_BYTES + 1)]), [
    "applicants[0].travel_document",
  ]);
  assert.deepStrictEqual(fields(body, [file(0, EXE)]), [
    "applicants[0].travel_document",
  ]);
  assert.deepStrictEqual(fields(body, [file(0), file(3)]), [
    "travel_document_3",
  ]);
});

test("file type comes from the first bytes", () => {
  assert.strictEqual(detectFileType(PDF).ext, "pdf");
  assert.strictEqual(detectFileType(PNG).ext, "png");
  assert.strictEqual(detectFileType(JPG).ext, "jpg");
  assert.strictEqual(detectFileType(EXE), null);
  assert.strictEqual(detectFileType(Buffer.alloc(0)), null);
});

test("payments use the Submit Initial Deposit rules", () => {
  const body = validBody();
  body.payments.push({ ...body.payments[0] });
  body.payments[0].local_payment_datetime = "2999-01-01T00:00";
  assert.deepStrictEqual(fields(body), [
    "payments[0].local_payment_datetime",
    "payments[1].payment_reference",
  ]);
  body.payments = [];
  assert.deepStrictEqual(fields(body), ["payments"]);
});

test("deposit at or above the minimum opens the case, below goes to review", () => {
  assert.deepStrictEqual(decideDeposit(7500, 7500), {
    meetsMinimum: true,
    statusCode: "case_created",
    paymentStatus: "approved",
  });
  assert.deepStrictEqual(decideDeposit(7499, 7500), {
    meetsMinimum: false,
    statusCode: "deposit_amount_review",
    paymentStatus: "pending",
  });
});

test("pack without a pricing row falls back to half its GBP price", () => {
  const line = toQuoteLine(
    {
      pack_id: 1,
      name: "Premium Plan",
      price_gbp: "149.51",
      currency_id: null,
    },
    "service",
    1,
  );
  assert.deepStrictEqual(line, {
    pack_type: "service",
    pack_id: 1,
    name: "Premium Plan",
    currency_id: 1,
    priceCents: 14951,
    upfrontCents: 7476,
    pricing_source: "fallback",
  });
});

test("pricing row wins over the fallback", () => {
  const line = toQuoteLine(
    {
      pack_id: 4,
      name: "Fast Track",
      price_gbp: "25.00",
      price: "30.00",
      upfront_price: "10.00",
      currency_id: 3,
    },
    "addon",
    1,
  );
  assert.strictEqual(line.currency_id, 3);
  assert.strictEqual(line.priceCents, 3000);
  assert.strictEqual(line.upfrontCents, 1000);
  assert.strictEqual(line.pricing_source, "pricing");
});

test("minimum is the sum of upfront amounts, in one currency only", () => {
  const quote = summarizeQuote([
    { currency_id: 1, priceCents: 14951, upfrontCents: 7476 },
    { currency_id: 1, priceCents: 2500, upfrontCents: 1250 },
  ]);
  assert.strictEqual(quote.minimumCents, 8726);
  assert.strictEqual(quote.totalCents, 17451);

  assert.throws(
    () =>
      summarizeQuote([
        { currency_id: 1, priceCents: 1, upfrontCents: 1 },
        { currency_id: 3, priceCents: 1, upfrontCents: 1 },
      ]),
    (error) => error.statusCode === 422,
  );
});

test("each applicant pays for the packs: case minimum and total scale", () => {
  const quote = forApplicants(
    summarizeQuote([
      { currency_id: 1, priceCents: 14951, upfrontCents: 7476 },
      { currency_id: 1, priceCents: 2500, upfrontCents: 1250 },
    ]),
    2,
  );
  assert.strictEqual(quote.applicantCount, 2);
  assert.deepStrictEqual(quote.perApplication, {
    minimumCents: 8726,
    totalCents: 17451,
  });
  assert.strictEqual(quote.minimumCents, 17452);
  assert.strictEqual(quote.totalCents, 34902);
});

test("2 applicants, 1 service pack and 1 add-on: a pack row per application", () => {
  const lines = [
    { pack_type: "service", pack_id: 1, priceCents: 14951 },
    { pack_type: "addon", pack_id: 4, priceCents: 2500 },
  ];
  const row = (application_id, pack_type, pack_id, price_at_booking) => ({
    application_id,
    pack_type,
    pack_id,
    price_at_booking,
    created_by_user_id: 100005,
    created_by: "100005",
  });
  assert.deepStrictEqual(
    applicationPackRows([101, 102], lines, 100005, "100005"),
    [
      row(101, "service", 1, 149.51),
      row(101, "addon", 4, 25),
      row(102, "service", 1, 149.51),
      row(102, "addon", 4, 25),
    ],
  );
});

test("applicant_count defaults to 1 and is capped", () => {
  assert.strictEqual(parseApplicantCount(undefined), 1);
  assert.strictEqual(parseApplicantCount("3"), 3);
  assert.throws(() => parseApplicantCount("0"));
  assert.throws(() => parseApplicantCount("11"));
});

test("id lists accept comma lists or repeated params", () => {
  assert.deepStrictEqual(parseIdList("1, 3,3", "ids"), [1, 3]);
  assert.deepStrictEqual(parseIdList(["4", "5"], "ids"), [4, 5]);
  assert.deepStrictEqual(parseIdList(undefined, "ids"), []);
  assert.throws(() => parseIdList(undefined, "ids", { required: true }));
  assert.throws(() => parseIdList("1,x", "ids"));
});

test("my cases: no filters is page 1 of everything", () => {
  assert.deepStrictEqual(parseMyCasesQuery({}), {
    namePattern: null,
    whatsappDigits: null,
    status: null,
    page: 1,
  });
  assert.deepStrictEqual(
    parseMyCasesQuery({ name: " ", whatsapp: "", status: "" }),
    parseMyCasesQuery({}),
  );
});

test("my cases: WhatsApp search matches the exact number, digits only", () => {
  const { whatsappDigits } = parseMyCasesQuery({
    whatsapp: "+44 (7900) 000-001",
  });
  assert.strictEqual(whatsappDigits, "447900000001");
  assert.throws(() => parseMyCasesQuery({ whatsapp: "abc" }), {
    statusCode: 400,
  });
});

test("my cases: name search is a partial match with wildcards escaped", () => {
  assert.strictEqual(
    parseMyCasesQuery({ name: "  Asha   Patel " }).namePattern,
    "%Asha Patel%",
  );
  assert.strictEqual(
    parseMyCasesQuery({ name: "50%_off" }).namePattern,
    "%50\\%\\_off%",
  );
  assert.throws(() => parseMyCasesQuery({ name: "x".repeat(201) }), {
    statusCode: 400,
  });
});

test("my cases: status filter takes only the 5 case states", () => {
  [
    "pending_initial_deposit",
    "deposit_amount_review",
    "case_created",
    "case_in_progress",
    "case_completed",
  ].forEach((status) =>
    assert.strictEqual(parseMyCasesQuery({ status }).status, status),
  );
  assert.throws(() => parseMyCasesQuery({ status: "appointments_pending" }), {
    statusCode: 400,
  });
});

test("my cases: filters combine; page must be a positive integer, sent once", () => {
  assert.deepStrictEqual(
    parseMyCasesQuery({
      name: "Asha",
      whatsapp: "+447900000001",
      status: "case_created",
      page: "2",
    }),
    {
      namePattern: "%Asha%",
      whatsappDigits: "447900000001",
      status: "case_created",
      page: 2,
    },
  );
  assert.throws(() => parseMyCasesQuery({ page: "0" }), { statusCode: 400 });
  assert.throws(() => parseMyCasesQuery({ page: "x" }), { statusCode: 400 });
  assert.throws(() => parseMyCasesQuery({ status: ["case_created", "x"] }), {
    statusCode: 400,
  });
});
