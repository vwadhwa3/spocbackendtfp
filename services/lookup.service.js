const { getSupabase } = require("../config/database");
const { ROLES } = require("../middleware/role.middleware");
const { getEnabledBankAccountsService } = require("./deposit.service");

// Dropdown data for the SPOC Add New Case wizard. Read-only.

// Only the roles a case can be assigned to; any other value is rejected so the
// route can't be used to list Admins or other SPOCs.
const ASSIGNABLE_ROLES = {
  CSR: ROLES.CSR,
  TeamLead: ROLES.TEAM_LEAD,
};

const lookupError = (statusCode, error, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.error = error;
  return err;
};

// Unwraps a Supabase response: throws on error, returns data otherwise.
const run = async (request) => {
  const { data, error } = await request;
  if (error) throw error;
  return data;
};

// Returns the role_id for ?role=, or throws 400.
const parseAssignableRole = (role) => {
  if (!Object.hasOwn(ASSIGNABLE_ROLES, role)) {
    throw lookupError(
      400,
      "VALIDATION_ERROR",
      `role must be one of: ${Object.keys(ASSIGNABLE_ROLES).join(", ")}`,
    );
  }
  return ASSIGNABLE_ROLES[role];
};

// Returns the country id for ?country_id=, null when omitted, or throws 400.
const parseCountryId = (countryId) => {
  if (countryId == null || countryId === "") return null;

  const id = Number(countryId);
  if (!Number.isInteger(id) || id <= 0) {
    throw lookupError(
      400,
      "VALIDATION_ERROR",
      "country_id must be a positive integer",
    );
  }
  return id;
};

// Get Countries
const getCountriesService = async () =>
  run(
    getSupabase()
      .from("country")
      .select("country_id, name, country_name, continent")
      .eq("is_active", 1)
      .is("discontinued_at", null)
      .order("name"),
  );

// Get Cities
const getCitiesService = async (countryId) => {
  let query = getSupabase()
    .from("city")
    .select("city_id, name, region, country_id")
    .order("name");

  if (countryId != null) query = query.eq("country_id", countryId);

  return run(query);
};

// Get Visa Categories
const getVisaCategoriesService = async () =>
  run(
    getSupabase()
      .from("visa_category")
      .select("visa_category_id, code, name, description")
      .order("name"),
  );

// Service packs and add-on packs share the same shape.
const getActivePacks = (table, idColumn) =>
  run(
    getSupabase()
      .from(table)
      .select(`${idColumn}, name, description, price_gbp`)
      .eq("active", 1)
      .is("discontinued_at", null)
      .order("name"),
  );

// Get Service Packs
const getServicePacksService = () =>
  getActivePacks("service_pack", "service_pack_id");

// Get Add-On Packs
const getAddOnPacksService = () =>
  getActivePacks("add_on_pack", "add_on_pack_id");

// Get Bank Accounts
const getBankAccountsService = () => getEnabledBankAccountsService();

// Get Users By Role
const getUsersByRoleService = async (roleId) =>
  run(
    getSupabase()
      .from("s_user")
      .select("user_id, first_name, last_name, email")
      .eq("user_role_type_id", roleId)
      .eq("is_active", 1)
      .is("discontinued_at", null)
      .order("first_name")
      .order("last_name"),
  );

module.exports = {
  getCountriesService,
  getCitiesService,
  getVisaCategoriesService,
  getServicePacksService,
  getAddOnPacksService,
  getBankAccountsService,
  getUsersByRoleService,
  parseAssignableRole,
  parseCountryId,
};
