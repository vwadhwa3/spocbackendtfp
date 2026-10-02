const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { getSupabase } = require("../config/database");

const JWT_SECRET =
  process.env.JWT_SECRET || "your-super-secret-jwt-key-change-in-production";
const JWT_EXPIRES_IN = "8h";

const USER_COLUMNS =
  "user_id, email, password_hash, first_name, last_name, user_role_type_id, role(role_name)";

const toAuthUser = (user) => ({
  userId: user.user_id,
  email: user.email,
  roleId: user.user_role_type_id,
  roleName: user.role.role_name,
  firstName: user.first_name,
  lastName: user.last_name,
});

const authError = (statusCode, error, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.error = error;
  return err;
};

// Active users only; `filter` narrows the query to one user.
const findActiveUser = async (filter) => {
  const { data, error } = await filter(
    getSupabase()
      .from("s_user")
      .select(USER_COLUMNS)
      .eq("is_active", 1)
      .is("discontinued_at", null),
  ).maybeSingle();

  if (error) throw error;
  return data;
};

// Login
const loginService = async ({ email, password }) => {
  if (!email || !password) {
    throw authError(400, "VALIDATION_ERROR", "Email and password are required");
  }

  // Case-insensitive exact match: escape ilike wildcards (`_` is common in emails).
  const pattern = String(email)
    .trim()
    .replace(/[\\%_]/g, "\\$&");
  const user = await findActiveUser((q) => q.ilike("email", pattern));

  // Same message for unknown, inactive and wrong password: don't reveal which.
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw authError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  const token = jwt.sign(
    { userId: user.user_id, roleId: user.user_role_type_id },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );

  return { token, user: toAuthUser(user) };
};

// Decode a bearer token, or return null if it is invalid or expired
const decodeTokenService = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
};

// Get an active user by id, or null if missing or deactivated
const getActiveUserService = async (userId) => {
  const user = await findActiveUser((q) => q.eq("user_id", userId));
  return user ? toAuthUser(user) : null;
};

module.exports = {
  loginService,
  decodeTokenService,
  getActiveUserService,
};
