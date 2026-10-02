const { addMonths, isAfter, isBefore, parseISO } = require("date-fns");
const { db } = require("../config/dataBase");

const t = (v) => (typeof v === "string" ? v.trim() || null : v ?? null);

const isValidDateString = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "") && !isNaN(parseISO(v));

const MAX_STICKER_NUMBER_LENGTH = 50;

// Strict boolean coercion: real booleans, 0/1, or "true"/"false" strings only.
// Anything else (missing, "yes", other strings) is treated as invalid, not falsy.
const parseStrictBoolean = (v) => {
  if (v === true || v === 1 || v === "true" || v === "1") return true;
  if (v === false || v === 0 || v === "false" || v === "0") return false;
  return null;
};

const VISA_HISTORY_COLS =
  "visa_history_id, form_id, had_schengen_visa_last_59_months, previous_biometrics_date, visa_sticker_number, visa_valid_from, visa_valid_to, issuing_country_id";

// created_by is NOT NULL with no DB default, so it must be set on insert — but an
// upsert would then rewrite it on every save and lose the original creator. Insert
// with it, update without it, and retry as an update if a concurrent insert wins
// the race on UNIQUE(form_id).
const writeVisaHistory = async (supabase, payload, actor) => {
  const update = () =>
    supabase
      .from("visa_history")
      .update({ ...payload, updated_by: actor, updation_timestamp: new Date().toISOString() })
      .eq("form_id", payload.form_id)
      .select(VISA_HISTORY_COLS)
      .single();

  const { data: existing, error: existingErr } = await supabase
    .from("visa_history")
    .select("visa_history_id")
    .eq("form_id", payload.form_id)
    .maybeSingle();

  if (existingErr) throw existingErr;

  if (existing) {
    const { data, error } = await update();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("visa_history")
    .insert({ ...payload, created_by: actor })
    .select(VISA_HISTORY_COLS)
    .single();

  if (!error) return data;
  if (error.code !== "23505") throw error; // unique_violation — someone inserted first

  const { data: retried, error: retryErr } = await update();
  if (retryErr) throw retryErr;
  return retried;
};

/**
 * SAVE / UPDATE VISA HISTORY DETAILS
 *
 * Expects:
 *   form_id                              – required
 *   had_schengen_visa_last_59_months     – required boolean/0/1
 *   previous_biometrics_date             – required if had_schengen_visa_last_59_months, must be within 59 months and not in the future
 *   visa_sticker_number                  – required when has Schengen visa
 *   visa_valid_from                      – required when has Schengen visa
 *   visa_valid_to                        – required when has Schengen visa
 *   issuing_country_id                   – required when has Schengen visa
 *   updated_by                           – optional actor
 */
const saveVisaHistory = async (data) => {
  const { supabase } = await db();

  const {
    form_id,
    had_schengen_visa_last_59_months,
    previous_biometrics_date,
    visa_sticker_number,
    visa_valid_from,
    visa_valid_to,
    issuing_country_id,
    updated_by,
  } = data;

  if (!form_id) {
    const err = new Error("Form ID is required");
    err.status = 400;
    err.field = "form_id";
    throw err;
  }

  const { data: formRecord, error: formErr } = await supabase
    .from("application_form")
    .select("form_id")
    .eq("form_id", form_id)
    .maybeSingle();

  if (formErr) throw formErr;
  if (!formRecord) {
    const err = new Error("Application form not found.");
    err.status = 404;
    err.field = "form_id";
    throw err;
  }

  const hadSchengenVisa = parseStrictBoolean(had_schengen_visa_last_59_months);
  if (hadSchengenVisa === null) {
    const err = new Error("Select whether you had a Schengen visa in the last 59 months");
    err.status = 400;
    err.field = "had_schengen_visa_last_59_months";
    throw err;
  }

  const actor = t(updated_by) || "visa-history-api";

  // ---- No previous visa: persist as No, fields NULL (never delete) ----
  if (!hadSchengenVisa) {
    const result = await writeVisaHistory(
      supabase,
      {
        form_id,
        had_schengen_visa_last_59_months: 0,
        previous_biometrics_date: null,
        visa_sticker_number: null,
        visa_valid_from: null,
        visa_valid_to: null,
        issuing_country_id: null,
      },
      actor
    );

    return {
      success: true,
      message: "No previous visa details required.",
      data: result,
    };
  }

  // ---- Required field validation when has Schengen visa ----
  const errors = [];

  if (!t(visa_sticker_number)) {
    errors.push({ field: "visa_sticker_number", message: "Visa sticker number is required" });
  } else if (t(visa_sticker_number).length > MAX_STICKER_NUMBER_LENGTH) {
    errors.push({
      field: "visa_sticker_number",
      message: `Visa sticker number must be ${MAX_STICKER_NUMBER_LENGTH} characters or fewer`,
    });
  }

  if (!visa_valid_from || !isValidDateString(visa_valid_from)) {
    errors.push({ field: "visa_valid_from", message: "Enter visa start date" });
  }

  if (!visa_valid_to || !isValidDateString(visa_valid_to)) {
    errors.push({ field: "visa_valid_to", message: "Enter visa end date" });
  }

  if (
    visa_valid_from &&
    visa_valid_to &&
    isValidDateString(visa_valid_from) &&
    isValidDateString(visa_valid_to) &&
    !isAfter(parseISO(visa_valid_to), parseISO(visa_valid_from))
  ) {
    errors.push({ field: "visa_valid_to", message: "Visa end date must be after start date" });
  }

  if (!previous_biometrics_date || !isValidDateString(previous_biometrics_date)) {
    errors.push({ field: "previous_biometrics_date", message: "Enter biometrics date" });
  } else {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const fiftyNineMonthsAgo = addMonths(today, -59);
    const biometricsDate = parseISO(previous_biometrics_date);
    if (isBefore(biometricsDate, fiftyNineMonthsAgo)) {
      errors.push({
        field: "previous_biometrics_date",
        message: "Biometrics date must be within 59 months",
      });
    } else if (isAfter(biometricsDate, today)) {
      errors.push({ field: "previous_biometrics_date", message: "Biometrics date cannot be in the future" });
    }
  }

  const countryNum = issuing_country_id != null ? Number(issuing_country_id) : NaN;
  if (!issuing_country_id || isNaN(countryNum)) {
    errors.push({ field: "issuing_country_id", message: "Select issuing country" });
  }

  if (errors.length > 0) {
    const err = new Error(errors[0].message);
    err.status = 400;
    err.field = errors[0].field;
    err.validationErrors = errors;
    throw err;
  }

  // ---- Validate issuing_country_id against country table ----
  const { data: countryRecord, error: countryErr } = await supabase
    .from("country")
    .select("country_id")
    .eq("country_id", countryNum)
    .maybeSingle();

  if (countryErr) throw countryErr;
  if (!countryRecord) {
    const err = new Error("Select issuing country");
    err.status = 400;
    err.field = "issuing_country_id";
    throw err;
  }

  // ---- Write visa_history ----
  const result = await writeVisaHistory(
    supabase,
    {
      form_id,
      had_schengen_visa_last_59_months: 1,
      previous_biometrics_date,
      visa_sticker_number: t(visa_sticker_number),
      visa_valid_from,
      visa_valid_to,
      issuing_country_id: countryNum,
    },
    actor
  );

  return {
    success: true,
    message: "Visa history details saved successfully.",
    data: result,
  };
};

/**
 * GET VISA HISTORY DETAILS FOR A FORM
 */
const getVisaHistory = async (form_id) => {
  const { supabase } = await db();

  if (!form_id) {
    const err = new Error("Form ID is required");
    err.status = 400;
    err.field = "form_id";
    throw err;
  }

  const { data, error } = await supabase
    .from("visa_history")
    .select(
      "visa_history_id, form_id, had_schengen_visa_last_59_months, previous_biometrics_date, visa_sticker_number, visa_valid_from, visa_valid_to, issuing_country_id"
    )
    .eq("form_id", form_id)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const err = new Error("Visa history details not found for this form.");
    err.status = 404;
    throw err;
  }

  return { success: true, data };
};

/**
 * GET ALL VISA HISTORY
 */
const getAllVisaHistory = async () => {
  const { supabase } = await db();

  const { data, error } = await supabase
    .from("visa_history")
    .select(VISA_HISTORY_COLS);

  if (error) throw error;

  return { success: true, data };
};

module.exports = {
  saveVisaHistory,
  getVisaHistory,
  getAllVisaHistory,
};
