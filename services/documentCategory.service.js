const { getPool } = require("../config/database");

const getAllDocumentCategoriesService = async () => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  const result = await pool.query(`
    SELECT
      document_category_id,
      name,
      description,
      created_by,
      creation_timestamp,
      updated_by,
      updation_timestamp,
      valid_from_date,
      valid_to_date,
      discontinued_by,
      discontinued_at
    FROM document_category
    WHERE discontinued_at IS NULL
    ORDER BY document_category_id;
  `);

  return result.rows;
};

const createDocumentCategoryService = async (categoryData) => {
  const pool = getPool();

  if (!pool) {
    throw new Error("Database connection not initialized.");
  }

  const { name, description, created_by } = categoryData;

  if (!name || !name.trim()) {
    throw new Error("name is required");
  }

  if (!created_by) {
    throw new Error("created_by is required");
  }

  const result = await pool.query(
    `
      INSERT INTO document_category
      (
        name,
        description,
        created_by
      )
      VALUES
      (
        $1,
        $2,
        $3
      )
      RETURNING *;
    `,
    [name.trim(), description || null, String(created_by)],
  );

  return result.rows[0];
};

module.exports = {
  getAllDocumentCategoriesService,
  createDocumentCategoryService,
};
