const test = require("node:test");
const assert = require("node:assert");
const {
  splitEqually,
  validateSubmission,
  validateReview,
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
