const { parseISO } = require("date-fns");

// Shared field helpers. Kept here so caseService and personalDetailsService
// validate identically instead of drifting apart.

const t = (v) => (typeof v === "string" ? v.trim() || null : v ?? null);

const isValidDateString = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "") && !isNaN(parseISO(v));

const isPositiveInt = (v) => typeof v !== "boolean" && Number.isInteger(Number(v)) && Number(v) > 0;

const isPositiveNumber = (v) => typeof v !== "boolean" && !isNaN(Number(v)) && Number(v) >= 0;

const WHATSAPP_RE = /^\+[1-9]\d{6,14}$/;

/**
 * Coerces the many ways a yes/no reaches us (JSON booleans, multipart strings,
 * the smallint the column actually stores) to 0 / 1, or null when unreadable.
 */
const toFlag = (v) => {
  if (v === true || v === 1 || v === "1" || v === "true" || v === "yes") return 1;
  if (v === false || v === 0 || v === "0" || v === "false" || v === "no") return 0;
  return null;
};

/** Collects field errors instead of throwing on the first one. */
class ValidationErrors {
  constructor() {
    this.errors = [];
  }
  add(field, message, status = 400) {
    this.errors.push({ field, message, status });
  }
  get length() {
    return this.errors.length;
  }
  throwIfAny() {
    if (this.errors.length === 0) return;
    const err = new Error(this.errors[0].message);
    err.status = this.errors[0].status || 400;
    err.field = this.errors[0].field;
    err.validationErrors = this.errors.map(({ field, message }) => ({ field, message }));
    throw err;
  }
}

module.exports = {
  t,
  isValidDateString,
  isPositiveInt,
  isPositiveNumber,
  WHATSAPP_RE,
  toFlag,
  ValidationErrors,
};
