const ROLES = {
  SPOC: 1,
  CSR: 2,
  LEAD_CONSULTANT: 4,
  ADMIN: 5,
  TEAM_LEAD: 26,
};

const ROLE_NAMES = {
  1: "SPOC",
  2: "CSR",
  4: "LEAD_CONSULTANT",
  5: "ADMIN",
  26: "TEAM_LEAD",
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

const requireLeadConsultantOrAdmin = requireRole(ROLES.LEAD_CONSULTANT, ROLES.ADMIN);

const requireSPOCorLeadConsultantOrAdmin = requireRole(ROLES.SPOC, ROLES.LEAD_CONSULTANT, ROLES.ADMIN);

const requireAnyRole = requireRole(ROLES.SPOC, ROLES.CSR, ROLES.LEAD_CONSULTANT, ROLES.ADMIN, ROLES.TEAM_LEAD);

module.exports = {
  ROLES,
  ROLE_NAMES,
  requireRole,
  requireSPOC,
  requireLeadConsultantOrAdmin,
  requireSPOCorLeadConsultantOrAdmin,
  requireAnyRole,
};