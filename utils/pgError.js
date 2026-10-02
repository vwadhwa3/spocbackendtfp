// Maps raw Postgres error codes to an HTTP status + friendly message, so
// callers using the transactional pg pool get the same error shape the
// Supabase-based routes already produce.
const mapPgError = (err, tableLabel = "record") => {
  const code = err.code || "";

  if (code === "23505") return { status: 409, message: `This ${tableLabel} already exists.` };
  if (code === "23503") return { status: 422, message: `Some of the information provided doesn't match our records.` };
  if (code === "23514") return { status: 422, message: `The information provided for ${tableLabel} is not valid.` };
  if (code === "23502") return { status: 422, message: `Please make sure all required fields for ${tableLabel} are filled in.` };
  if (code === "22P02") return { status: 422, message: `The data format for ${tableLabel} is incorrect.` };

  return { status: 500, message: "Something went wrong while saving your information. Please try again." };
};

module.exports = { mapPgError };
