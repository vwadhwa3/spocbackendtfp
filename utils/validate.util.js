const { parseISO } = require("date-fns");

// Shared field helpers, so the form services validate identically instead of
// drifting apart.

// Trims strings; empty strings and undefined become null.
const t = (v) => (typeof v === "string" ? v.trim() || null : (v ?? null));

const isValidDateString = (v) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v || "") && !isNaN(parseISO(v));

const isPositiveInt = (v) =>
  typeof v !== "boolean" && Number.isInteger(Number(v)) && Number(v) > 0;

module.exports = {
  t,
  isValidDateString,
  isPositiveInt,
};
