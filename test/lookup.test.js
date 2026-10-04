const test = require("node:test");
const assert = require("node:assert");
const {
  parseAssignableRole,
  parseCountryId,
} = require("../services/lookup.service");
const { ROLES } = require("../middleware/role.middleware");

const statusOf = (fn) => {
  try {
    fn();
  } catch (error) {
    return error.statusCode;
  }
  return null;
};

test("role filter only allows CSR and TeamLead", () => {
  assert.strictEqual(parseAssignableRole("CSR"), ROLES.CSR);
  assert.strictEqual(parseAssignableRole("TeamLead"), ROLES.TEAM_LEAD);
  assert.strictEqual(
    statusOf(() => parseAssignableRole("Admin")),
    400,
  );
  assert.strictEqual(
    statusOf(() => parseAssignableRole(undefined)),
    400,
  );
  assert.strictEqual(
    statusOf(() => parseAssignableRole("toString")),
    400,
  );
});

test("country_id is optional but must be a positive integer", () => {
  assert.strictEqual(parseCountryId(undefined), null);
  assert.strictEqual(parseCountryId(""), null);
  assert.strictEqual(parseCountryId("3"), 3);
  assert.strictEqual(
    statusOf(() => parseCountryId("0")),
    400,
  );
  assert.strictEqual(
    statusOf(() => parseCountryId("abc")),
    400,
  );
  assert.strictEqual(
    statusOf(() => parseCountryId(["1", "2"])),
    400,
  );
});
