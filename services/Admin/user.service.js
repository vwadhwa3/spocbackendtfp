const { getPool } = require("../../config/dataBase.js");

// Get All Users
const getAllUsersService = async () => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  const result = await pool.query(
    `
      SELECT
        u.user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.is_active,
        u.user_role_type_id,
        r.role_name,
        u.valid_from_date,
        u.valid_to_date,
        u.created_by,
        u.creation_timestamp,
        u.updated_by,
        u.updation_timestamp
      FROM s_user u
      JOIN role r
        ON r.role_id = u.user_role_type_id
      ORDER BY u.user_id ASC;
    `,
  );

  return result.rows;
};

// Create User
const createUserService = async (userData) => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  const {
    user_id,
    password_hash,
    first_name,
    last_name,
    email,
    user_role_type_id,
    created_by,
  } = userData;

  const result = await pool.query(
    `
      INSERT INTO s_user (
        user_id,
        password_hash,
        first_name,
        last_name,
        email,
        user_role_type_id,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING
        user_id,
        first_name,
        last_name,
        email,
        is_active,
        user_role_type_id,
        valid_from_date,
        valid_to_date,
        created_by,
        creation_timestamp;
    `,
    [
      user_id,
      password_hash,
      first_name,
      last_name,
      email,
      user_role_type_id,
      created_by,
    ],
  );

  return result.rows[0];
};

module.exports = {
  getAllUsersService,
  createUserService,
};
