const test = require("node:test");
const assert = require("node:assert");
const {
  validatePersonal,
  validateTravelDocument,
  validateAddress,
  validateResidencePermit,
  validateOccupation,
  validateFinancing,
  validateAdditional,
} = require("../services/applicantEdit.service");

const fields = ({ errors }) => errors.map((e) => e.field);

const personal = (overrides = {}) => ({
  first_name: " Emma ",
  surname: "Carter",
  had_different_name: 0,
  date_of_birth: "1996-03-14",
  place_of_birth_id: 3,
  country_of_birth_id: "4",
  nationality_id: 4,
  gender_id: 2,
  marital_status_id: 1,
  ...overrides,
});

const address = (overrides = {}) => ({
  postcode: "M1 1AA",
  address_line1: "1 High Street",
  city: "Manchester",
  county: "Greater Manchester",
  country_id: 4,
  mobile_number: "+44 7900 000000",
  whatsapp_number: "+447900000000",
  email: "emma@example.com",
  ...overrides,
});

test("personal: trims text, converts ids and clears the previous name", () => {
  const result = validatePersonal(personal({ previous_name: "Old" }));
  assert.deepStrictEqual(result.errors, []);
  assert.strictEqual(result.values.first_name, "Emma");
  assert.strictEqual(result.values.country_of_birth_id, 4);
  assert.strictEqual(result.values.previous_name, null);
});

test("personal: a different name needs the previous name", () => {
  const result = validatePersonal(personal({ had_different_name: 1 }));
  assert.deepStrictEqual(fields(result), ["previous_name"]);
});

test("personal: date of birth must be in the past", () => {
  const result = validatePersonal(personal({ date_of_birth: "2999-01-01" }));
  assert.deepStrictEqual(fields(result), ["date_of_birth"]);
});

test("travel document: expiry must follow issue", () => {
  const result = validateTravelDocument({
    travel_document_type: "ORDINARY_PASSPORT",
    travel_document_number: "P1234567",
    issue_date: "2022-01-10",
    expiry_date: "2022-01-10",
  });
  assert.deepStrictEqual(fields(result), ["expiry_date"]);
});

test("address: normalizes phones and rejects a bad one", () => {
  assert.strictEqual(
    validateAddress(address()).values.mobile_number,
    "+447900000000",
  );
  assert.deepStrictEqual(
    fields(validateAddress(address({ mobile_number: "07900" }))),
    ["mobile_number"],
  );
});

test("residence permit: date of issue is optional", () => {
  const result = validateResidencePermit({
    permit_number: "S123",
    permit_type_id: 1,
    expiry_date: "2030-01-01",
  });
  assert.deepStrictEqual(result.errors, []);
  assert.strictEqual(result.values.issue_date, null);
});

test("occupation: fields a status doesn't use are saved empty", () => {
  const result = validateOccupation({
    occupation_category: "RETIRED",
    employer_name: "",
  });
  assert.deepStrictEqual(result.errors, []);
  assert.strictEqual(result.values.employer_name, null);
  assert.strictEqual(result.values.gross_annual_earnings, null);
});

test("occupation: earnings must be a number", () => {
  const result = validateOccupation({
    occupation_category: "EMPLOYEE",
    gross_annual_earnings: "lots",
  });
  assert.deepStrictEqual(fields(result), ["gross_annual_earnings"]);
});

test("financing: funding source is required, sponsor details are not", () => {
  assert.deepStrictEqual(fields(validateFinancing({})), ["funding_source"]);
  assert.deepStrictEqual(
    validateFinancing({ funding_source: "APPLICANT" }).errors,
    [],
  );
});

test("additional: the family member answer must be 0 or 1", () => {
  assert.deepStrictEqual(fields(validateAdditional({})), [
    "joins_eu_family_member",
  ]);
  assert.deepStrictEqual(
    validateAdditional({ joins_eu_family_member: 0 }).errors,
    [],
  );
});
