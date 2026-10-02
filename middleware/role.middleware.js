// role.role_id values in the database
const ROLES = {
  SPOC: 1,
  CSR: 2,
  LEAD_CONSULTANT: 4,
  ADMIN: 5,
  TEAM_LEAD: 26,
};

// Must run after authenticate, which sets req.user.
const requireRole =
  (...allowedRoleIds) =>
  (req, res, next) => {
    if (!allowedRoleIds.includes(req.user.roleId)) {
      return res.status(403).json({
        success: false,
        error: "FORBIDDEN",
        message: "You do not have permission to perform this action",
      });
    }

    next();
  };

module.exports = {
  ROLES,
  requireRole,
};
