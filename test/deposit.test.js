const test = require("node:test");
const assert = require("node:assert");
const {
  splitEqually,
  splitByPrice,
  getApplicationPrices,
  validateSubmission,
  validateReview,
  depositDecisionMessage,
  APPLICATION_STATUS_BY_CASE_STATUS,
  restoreApplicationStatuses,
} = require("../services/deposit.service");
const { ROLES, requireRole } = require("../middleware/role.middleware");

const validBody = () => ({
  timezone: "Asia/Kolkata",
  payments: [
    {
      amount: "50.25",
      bank_account_id: 5,
      payment_reference: "HDFC-001",
      local_payment_datetime: "2026-09-30T10:00",
    },
  ],
});

const fields = (body) => validateSubmission(body).map((e) => e.field);

test("valid submission has no errors", () => {
  assert.deepStrictEqual(validateSubmission(validBody()), []);
});

test("requires timezone and at least one payment", () => {
  assert.deepStrictEqual(fields({ payments: [] }), ["timezone", "payments"]);
});

test("rejects bad amount, bank account, reference and date", () => {
  const body = validBody();
  body.payments[0] = {
    amount: "-1",
    bank_account_id: "5",
    payment_reference: " ",
    local_payment_datetime: "2026-09-30T10:00+05:30",
  };
  assert.deepStrictEqual(fields(body), [
    "payments[0].amount",
    "payments[0].bank_account_id",
    "payments[0].payment_reference",
    "payments[0].local_payment_datetime",
  ]);
});

test("rejects more than 2 decimals", () => {
  const body = validBody();
  body.payments[0].amount = 10.123;
  assert.deepStrictEqual(fields(body), ["payments[0].amount"]);
});

test("rejects future payment in the SPOC's timezone", () => {
  const body = validBody();
  body.payments[0].local_payment_datetime = "2999-01-01T00:00";
  assert.deepStrictEqual(fields(body), ["payments[0].local_payment_datetime"]);
});

test("rejects repeated payment reference in one submission", () => {
  const body = validBody();
  body.payments.push({ ...body.payments[0] });
  assert.deepStrictEqual(fields(body), ["payments[1].payment_reference"]);
});

test("discount is optional but must be complete when sent", () => {
  const body = validBody();
  body.discount = { amount: "10", reason: "" };
  assert.deepStrictEqual(fields(body), ["discount.reason"]);
  body.discount.reason = "Loyal customer";
  assert.deepStrictEqual(fields(body), []);
});

test("splits deposit equally and the shares add up to the total", () => {
  assert.deepStrictEqual(splitEqually(10000, ["7", "8", "9"]), [
    { application_id: "7", allocated_deposit_amount: 33.34 },
    { application_id: "8", allocated_deposit_amount: 33.33 },
    { application_id: "9", allocated_deposit_amount: 33.33 },
  ]);
});

test("deposit splits by each application's price and leaves its balance", () => {
  assert.deepStrictEqual(
    splitByPrice(20000, [
      { application_id: 101, priceCents: 17451 },
      { application_id: 102, priceCents: 17451 },
    ]),
    [
      {
        application_id: 101,
        total_price: 174.51,
        allocated_deposit_amount: 100,
        balance_amount: 74.51,
      },
      {
        application_id: 102,
        total_price: 174.51,
        allocated_deposit_amount: 100,
        balance_amount: 74.51,
      },
    ],
  );

  const uneven = splitByPrice(10001, [
    { application_id: 1, priceCents: 20000 },
    { application_id: 2, priceCents: 10000 },
  ]);
  assert.deepStrictEqual(
    uneven.map((a) => a.allocated_deposit_amount),
    [66.68, 33.33],
  );
  assert.deepStrictEqual(
    uneven.map((a) => a.balance_amount),
    [133.32, 66.67],
  );
});

// Fake Supabase: each table answers with the rows given for it.
const fakeSupabase = (tables) => ({
  from: (table) => {
    const query = {
      select: () => query,
      in: () => query,
      eq: () => query,
      is: () => Promise.resolve({ data: tables[table], error: null }),
    };
    return query;
  },
});

test("application prices come from b_application_service_pack", async () => {
  const prices = await getApplicationPrices(
    fakeSupabase({
      b_application_service_pack: [
        { application_id: 101, price_at_booking: "149.51" },
        { application_id: 101, price_at_booking: "25.00" },
        { application_id: 102, price_at_booking: "149.51" },
        { application_id: 102, price_at_booking: "25.00" },
      ],
    }),
    50,
    [101, 102],
  );
  assert.deepStrictEqual(prices, [
    { application_id: 101, priceCents: 17451 },
    { application_id: 102, priceCents: 17451 },
  ]);
});

test("older cases share the case-level packs between applications", async () => {
  const prices = await getApplicationPrices(
    fakeSupabase({
      b_application_service_pack: [],
      b_case_service_pack: [
        { price_at_booking: "149.51" },
        { price_at_booking: "25.00" },
      ],
    }),
    6,
    [11, 12, 13],
  );
  assert.deepStrictEqual(prices, [
    { application_id: 11, priceCents: 5817 },
    { application_id: 12, priceCents: 5817 },
    { application_id: 13, priceCents: 5817 },
  ]);
});

test("review needs approve or reject; comments are optional text", () => {
  const reviewFields = (body) => validateReview(body).map((e) => e.field);
  assert.deepStrictEqual(reviewFields({ decision: "approve" }), []);
  assert.deepStrictEqual(
    reviewFields({ decision: "reject", comments: "Short by 200" }),
    [],
  );
  assert.deepStrictEqual(reviewFields({ decision: "maybe", comments: 5 }), [
    "decision",
    "comments",
  ]);
});

test("applications follow the case through the deposit step", () => {
  assert.deepStrictEqual(APPLICATION_STATUS_BY_CASE_STATUS, {
    pending_initial_deposit: "application_pending_initial_deposit",
    deposit_amount_review: "application_deposit_amount_review",
    case_created: "created",
  });
});

test("undo puts each application back to its own previous status", async () => {
  const updates = [];
  const supabase = {
    from: (table) => ({
      update: (values) => ({
        in: async (column, ids) => {
          updates.push({ table, values, column, ids });
          return { error: null };
        },
      }),
    }),
  };

  const result = await restoreApplicationStatuses(supabase, [
    { application_id: 1, status_id: 35 },
    { application_id: 2, status_id: 27 },
    { application_id: 3, status_id: 35 },
  ]);

  assert.deepStrictEqual(result, { error: null });
  assert.deepStrictEqual(updates, [
    {
      table: "b_applications",
      values: { status_id: 35 },
      column: "application_id",
      ids: [1, 3],
    },
    {
      table: "b_applications",
      values: { status_id: 27 },
      column: "application_id",
      ids: [2],
    },
  ]);
});

test("requireRole only lets the allowed role through", () => {
  const run = (roleId) => {
    let status = null;
    let nextCalled = false;
    const res = { status: (s) => ((status = s), { json: () => {} }) };
    requireRole(ROLES.SPOC)(
      { user: { roleId } },
      res,
      () => (nextCalled = true),
    );
    return nextCalled ? "next" : status;
  };

  assert.strictEqual(run(ROLES.SPOC), "next");
  for (const role of [
    ROLES.LEAD_CONSULTANT,
    ROLES.CSR,
    ROLES.TEAM_LEAD,
    ROLES.ADMIN,
  ]) {
    assert.strictEqual(run(role), 403);
  }
});

test("deposit decision message names the Customer Lead", () => {
  assert.strictEqual(
    depositDecisionMessage(true, "Asha Rao"),
    "Deposit approved for Asha Rao.",
  );
  assert.strictEqual(
    depositDecisionMessage(false, "Asha Rao"),
    "Deposit rejected for Asha Rao. Please enter the payment again.",
  );
});
