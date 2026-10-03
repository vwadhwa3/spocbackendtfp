const {
  decodeTokenService,
  getActiveUserService,
} = require("../services/auth.service");

// The `token` cookie is set by POST /api/auth/login.
const getCookieToken = (req) => {
  const cookie = (req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("token="));

  return cookie ? decodeURIComponent(cookie.slice("token=".length)) : null;
};

// Authorization header wins when both are sent.
const getToken = (req) => {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim() || null;
  }

  return getCookieToken(req) || null;
};

const authenticate = async (req, res, next) => {
  try {
    const token = getToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "UNAUTHORIZED",
        message: "Bearer token or token cookie required",
      });
    }

    const decoded = decodeTokenService(token);

    if (!decoded || decoded.type === "customer") {
      return res.status(401).json({
        success: false,
        error: "INVALID_TOKEN",
        message: "Invalid or expired token",
      });
    }

    const user = await getActiveUserService(decoded.userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: "USER_NOT_FOUND",
        message: "User not found or inactive",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(500).json({
      success: false,
      error: "AUTH_ERROR",
      message: "Authentication failed",
    });
  }
};

// For Customer Lead endpoints; sets req.customer instead of req.user.
const authenticateCustomer = (req, res, next) => {
  const token = getToken(req);
  const decoded = token ? decodeTokenService(token) : null;

  if (
    decoded?.type !== "customer" ||
    !Array.isArray(decoded.contactIds) ||
    decoded.contactIds.length === 0
  ) {
    return res.status(401).json({
      success: false,
      error: "INVALID_TOKEN",
      message: "Customer token required",
    });
  }

  req.customer = { contactIds: decoded.contactIds };
  next();
};

module.exports = {
  authenticate,
  authenticateCustomer,
};
