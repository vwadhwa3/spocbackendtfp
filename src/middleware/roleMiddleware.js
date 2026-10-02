const ROLES = {
  SPOC: 1,
};

const ROLE_NAMES = {
  1: "SPOC",
};

const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const userRoleId = req.user.roleId;

    if (!allowedRoles.includes(userRoleId)) {
      const requiredRoleNames = allowedRoles.map(id => ROLE_NAMES[id] || `Role ${id}`).join(", ");
      return res.status(403).json({
        success: false,
        error: "FORBIDDEN",
        message: "Insufficient permissions",
        requiredRole: requiredRoleNames,
        currentRole: ROLE_NAMES[userRoleId] || `Role ${userRoleId}`,
      });
    }

    next();
  };
};

const requireSPOC = requireRole(ROLES.SPOC);

module.exports = {
  ROLES,
  ROLE_NAMES,
  requireRole,
  requireSPOC,
};