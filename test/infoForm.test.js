const test = require("node:test");
const assert = require("node:assert");
const {
  normalizePhone,
  orderApplicants,
  allFormsSubmitted,
} = require("../services/infoForm.service");

test("normalizePhone keeps digits only", () => {
  assert.strictEqual(normalizePhone("+91 98765-43210"), "919876543210");
  assert.strictEqual(normalizePhone(null), "");
});

test("orderApplicants puts the lead first, then by contact id", () => {
  assert.deepStrictEqual(orderApplicants([7, 3, 5], 5), [5, 3, 7]);
  assert.deepStrictEqual(orderApplicants([7, 3], 99), [3, 7]);
});

test("allFormsSubmitted needs every form submitted", () => {
  assert.strictEqual(allFormsSubmitted([]), false);
  assert.strictEqual(allFormsSubmitted([{ status: "submitted" }, null]), false);
  assert.strictEqual(
    allFormsSubmitted([{ status: "submitted" }, { status: "reopened" }]),
    false,
  );
  assert.strictEqual(
    allFormsSubmitted([{ status: "submitted" }, { status: "submitted" }]),
    true,
  );
});
