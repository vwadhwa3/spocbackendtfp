const express = require("express");

const router = express.Router();

const { authenticate } = require("../middleware/auth.middleware");
const { ROLES, requireRole } = require("../middleware/role.middleware");
const {
  getCountriesController,
  getCitiesController,
  getVisaCategoriesController,
  getServicePacksController,
  getAddOnPacksController,
  getBankAccountsController,
  getUsersByRoleController,
} = require("../controllers/lookup.controller");

// Add New Case wizard dropdowns. The data isn't role-sensitive, but the routes
// are still SPOC-only so they can't be scraped without a SPOC login.
// Applied per route, not via router.use(), because this router is mounted on
// /api and router-level middleware would gate every /api/* path.
const spocOnly = [authenticate, requireRole(ROLES.SPOC)];

// Get Countries
router.get("/countries", spocOnly, getCountriesController);

// Get Cities
router.get("/cities", spocOnly, getCitiesController);

// Get Visa Categories
router.get("/visa-categories", spocOnly, getVisaCategoriesController);

// Get Service Packs
router.get("/service-packs", spocOnly, getServicePacksController);

// Get Add-On Packs
router.get("/add-on-packs", spocOnly, getAddOnPacksController);

// Get Bank Accounts
router.get("/bank-accounts", spocOnly, getBankAccountsController);

// Get Users By Role
router.get("/users", spocOnly, getUsersByRoleController);

module.exports = router;
