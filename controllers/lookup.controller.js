const {
  getCountriesService,
  getCitiesService,
  getVisaCategoriesService,
  getServicePacksService,
  getAddOnPacksService,
  getBankAccountsService,
  getUsersByRoleService,
  getGendersService,
  getMaritalStatusesService,
  getTravelDocumentTypesService,
  parseAssignableRole,
  parseCountryId,
} = require("../services/lookup.service");

const sendError = (res, error) => {
  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      error: error.error,
      message: error.message,
    });
  }

  console.error("Lookup Error:", error);
  return res.status(500).json({
    success: false,
    error: "INTERNAL_ERROR",
    message: "Something went wrong",
  });
};

// Wraps a handler so every lookup endpoint shares the same error response.
const handle = (fn) => async (req, res) => {
  try {
    res.json({ success: true, data: await fn(req) });
  } catch (error) {
    sendError(res, error);
  }
};

// Get Countries
const getCountriesController = handle(() => getCountriesService());

// Get Cities
const getCitiesController = handle((req) =>
  getCitiesService(parseCountryId(req.query.country_id)),
);

// Get Visa Categories
const getVisaCategoriesController = handle(() => getVisaCategoriesService());

// Get Service Packs
const getServicePacksController = handle(() => getServicePacksService());

// Get Add-On Packs
const getAddOnPacksController = handle(() => getAddOnPacksService());

// Get Bank Accounts
const getBankAccountsController = handle(() => getBankAccountsService());

// Get Users By Role
const getUsersByRoleController = handle((req) =>
  getUsersByRoleService(parseAssignableRole(req.query.role)),
);

// Get Genders
const getGendersController = handle(() => getGendersService());

// Get Marital Statuses
const getMaritalStatusesController = handle(() => getMaritalStatusesService());

// Get Travel Document Types
const getTravelDocumentTypesController = handle(() =>
  getTravelDocumentTypesService(),
);

module.exports = {
  getCountriesController,
  getCitiesController,
  getVisaCategoriesController,
  getServicePacksController,
  getAddOnPacksController,
  getBankAccountsController,
  getUsersByRoleController,
  getGendersController,
  getMaritalStatusesController,
  getTravelDocumentTypesController,
};
