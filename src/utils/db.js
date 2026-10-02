const { getPool } = require("../../config/dataBase");

const query = async (text, params) => {
  const pool = getPool();
  if (!pool) {
    throw new Error("Database pool not initialized");
  }
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
};

const queryOne = async (text, params) => {
  const result = await query(text, params);
  return result.rows[0] || null;
};

const queryMany = async (text, params) => {
  const result = await query(text, params);
  return result.rows;
};

const transaction = async (callback) => {
  const pool = getPool();
  if (!pool) {
    throw new Error("Database pool not initialized");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  query,
  queryOne,
  queryMany,
  transaction,
};