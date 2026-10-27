const { db: connectDatabases, getPool } = require("../config/database");

// If the startup connection test failed, config/database.js leaves no pool
// and nothing retries it; try setting it up again before giving up.
const getDb = async () => {
  if (!getPool()) await connectDatabases();
  const pool = getPool();
  if (!pool) throw new Error("PostgreSQL pool is not available");
  return pool;
};

// Runs fn with one pooled connection. Queries fired together on one client
// queue up on it; on the pool, each opens its own connection to the remote
// pooler, and a burst of them hit connectionTimeoutMillis.
const withClient = async (fn) => {
  const client = await (await getDb()).connect();
  let broken;
  try {
    return await fn(client);
  } catch (error) {
    // A database failure may have left the connection unusable, so it is
    // dropped instead of going back to the pool. Request errors keep it.
    if (!error.statusCode) broken = error;
    throw error;
  } finally {
    client.release(broken);
  }
};

// Runs fn(client) inside BEGIN/COMMIT on one pooled connection. Any error,
// including request errors thrown on purpose, rolls everything back.
const withTransaction = (fn) =>
  withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client
        .query("ROLLBACK")
        .catch((rollbackError) =>
          console.error("Transaction rollback failed:", rollbackError),
        );
      throw error;
    }
  });

module.exports = { getDb, withClient, withTransaction };
