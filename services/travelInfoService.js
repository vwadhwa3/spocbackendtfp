const { parseISO, isAfter, startOfToday } = require("date-fns");
const { db } = require("../config/dataBase");

const t = (v) => (typeof v === "string" ? v.trim() || null : v ?? null);

const isValidDateString = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "") && !isNaN(parseISO(v));

const isPositiveInt = (v) => typeof v !== "boolean" && Number.isInteger(Number(v)) && Number(v) > 0;

const TRAVEL_INFO_COLS =
  "travel_info_id, form_id, visa_type, travel_dates, destination_preferences, copied_from_first_applicant, valid_from_date, valid_to_date";

// created_by is NOT NULL with no DB default, so it must be set on insert — but an
// upsert would then rewrite it on every save and lose the original creator. Insert
// with it, update without it, and retry as an update if a concurrent insert wins
// the race on UNIQUE(form_id).
const writeTravelInfo = async (supabase, payload, actor) => {
  const update = () =>
    supabase
      .from("travel_info")
      .update({ ...payload, updated_by: actor, updation_timestamp: new Date().toISOString() })
      .eq("form_id", payload.form_id)
      .select(TRAVEL_INFO_COLS)
      .single();

  const { data: existing, error: existingErr } = await supabase
    .from("travel_info")
    .select("travel_info_id")
    .eq("form_id", payload.form_id)
    .maybeSingle();

  if (existingErr) throw existingErr;

  if (existing) {
    const { data, error } = await update();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("travel_info")
    .insert({ ...payload, created_by: actor })
    .select(TRAVEL_INFO_COLS)
    .single();

  if (!error) return data;
  if (error.code !== "23505") throw error; // unique_violation — someone inserted first

  const { data: retried, error: retryErr } = await update();
  if (retryErr) throw retryErr;
  return retried;
};

/**
 * SAVE / UPDATE TRAVEL INFO
 *
 * Expects:
 *   form_id                                        – required
 *   visa_type                                       – required, must match visa_category.code
 *   travel_dates[].travel_date                      – required, YYYY-MM-DD, strictly after today
 *   travel_dates[].countries_to_visit                – required, non-empty array of country ids
 *   destination_preferences[].destination_country_id – required, valid country id
 *   destination_preferences[].application_city_id    – required, valid city id
 *   updated_by                                       – optional actor
 */
const saveTravelInfo = async (data) => {
  const { supabase } = await db();

  const { form_id, updated_by } = data;
  let { visa_type, travel_dates, destination_preferences } = data;

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

  const actor = t(updated_by) || "travel-info-api";
  const errors = [];

  // ---- visa_type ----
  visa_type = t(visa_type) ? t(visa_type).toUpperCase() : "TOURISM";

  const { data: categoryRecord, error: categoryErr } = await supabase
    .from("visa_category")
    .select("code")
    .eq("code", visa_type)
    .maybeSingle();

  if (categoryErr) throw categoryErr;
  if (!categoryRecord) {
    errors.push({ field: "visa_type", message: "Select visa type" });
  }

  // ---- travel_dates ----
  if (!Array.isArray(travel_dates) || travel_dates.length === 0) {
    errors.push({ field: "travel_dates", message: "Add at least one travel date" });
    travel_dates = [];
  } else {
    const today = startOfToday();
    travel_dates.forEach((row, i) => {
      if (!isValidDateString(row?.travel_date) || !isAfter(parseISO(row.travel_date), today)) {
        errors.push({ field: `travel_dates[${i}].travel_date`, message: "Add at least one travel date" });
      }
      if (!Array.isArray(row?.countries_to_visit) || row.countries_to_visit.length === 0) {
        errors.push({ field: `travel_dates[${i}].countries_to_visit`, message: "Enter countries to visit" });
      }
    });
  }

  // ---- destination_preferences ----
  if (!Array.isArray(destination_preferences) || destination_preferences.length === 0) {
    errors.push({ field: "destination_preferences", message: "Destination country is required" });
    destination_preferences = [];
  } else {
    destination_preferences.forEach((row, i) => {
      if (!isPositiveInt(row?.destination_country_id)) {
        errors.push({ field: `destination_preferences[${i}].destination_country_id`, message: "Destination country is required" });
      }
      if (!isPositiveInt(row?.application_city_id)) {
        errors.push({ field: `destination_preferences[${i}].application_city_id`, message: "Select an application city" });
      }
    });
  }

  // ---- FK validation (batch) ----
  const countryIds = new Set();
  travel_dates.forEach((row) => (row?.countries_to_visit || []).forEach((id) => countryIds.add(Number(id))));
  destination_preferences.forEach((row) => {
    if (isPositiveInt(row?.destination_country_id)) countryIds.add(Number(row.destination_country_id));
  });

  const cityIds = new Set();
  destination_preferences.forEach((row) => {
    if (isPositiveInt(row?.application_city_id)) cityIds.add(Number(row.application_city_id));
  });

  let countryRows = [];
  if (countryIds.size > 0) {
    const { data: rows, error: countryErr } = await supabase
      .from("country")
      .select("country_id, name")
      .in("country_id", [...countryIds]);
    if (countryErr) throw countryErr;
    countryRows = rows || [];
  }
  const countryById = new Map(countryRows.map((r) => [r.country_id, r]));

  let cityRows = [];
  if (cityIds.size > 0) {
    const { data: rows, error: cityErr } = await supabase
      .from("city")
      .select("city_id, name, country_id")
      .in("city_id", [...cityIds]);
    if (cityErr) throw cityErr;
    cityRows = rows || [];
  }
  const cityById = new Map(cityRows.map((r) => [r.city_id, r]));

  travel_dates.forEach((row, i) => {
    (row?.countries_to_visit || []).forEach((id) => {
      if (!countryById.has(Number(id))) {
        errors.push({ field: `travel_dates[${i}].countries_to_visit`, message: "Enter countries to visit" });
      }
    });
  });

  destination_preferences.forEach((row, i) => {
    if (isPositiveInt(row?.destination_country_id) && !countryById.has(Number(row.destination_country_id))) {
      errors.push({ field: `destination_preferences[${i}].destination_country_id`, message: "Destination country is required" });
    }
    if (isPositiveInt(row?.application_city_id) && !cityById.has(Number(row.application_city_id))) {
      errors.push({ field: `destination_preferences[${i}].application_city_id`, message: "Select an application city" });
    }
  });

  if (errors.length > 0) {
    const err = new Error(errors[0].message);
    err.status = 400;
    err.field = errors[0].field;
    err.validationErrors = errors;
    throw err;
  }

  // ---- Normalize ----
  const normalizedTravelDates = travel_dates.map((row) => ({
    travel_date: row.travel_date,
    countries_to_visit: [...new Set(row.countries_to_visit.map((id) => Number(id)))],
    notes: t(row.notes),
  }));

  const normalizedPreferences = destination_preferences.map((row) => ({
    destination_country_id: Number(row.destination_country_id),
    application_city_id: Number(row.application_city_id),
  }));

  const result = await writeTravelInfo(
    supabase,
    {
      form_id,
      visa_type,
      travel_dates: normalizedTravelDates,
      destination_preferences: normalizedPreferences,
    },
    actor
  );

  return {
    success: true,
    message: "Travel information saved successfully.",
    data: result,
  };
};

/**
 * GET TRAVEL INFO FOR A FORM
 *
 * Handles both the ID-based shape written by saveTravelInfo and the legacy
 * name-based jsonb shape still present on rows saved via the old /onboard path.
 */
const getTravelInfo = async (form_id) => {
  const { supabase } = await db();

  if (!form_id) {
    const err = new Error("Form ID is required");
    err.status = 400;
    err.field = "form_id";
    throw err;
  }

  const { data, error } = await supabase
    .from("travel_info")
    .select(TRAVEL_INFO_COLS)
    .eq("form_id", form_id)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const err = new Error("Travel information not found for this form.");
    err.status = 404;
    throw err;
  }

  const rawTravelDates = Array.isArray(data.travel_dates) ? data.travel_dates : [];
  const rawPreferences = Array.isArray(data.destination_preferences) ? data.destination_preferences : [];

  // Legacy rows store countries/cities by name, not id, so ids alone can't be
  // batched — pull both reference tables in full (small, bounded lookup tables)
  // and match everything in memory.
  const { data: countryRows, error: countryErr } = await supabase.from("country").select("country_id, name");
  if (countryErr) throw countryErr;
  const { data: cityRows, error: cityErr } = await supabase.from("city").select("city_id, name, country_id");
  if (cityErr) throw cityErr;

  const countryByName = new Map(countryRows.map((r) => [r.name.toLowerCase(), r]));
  const countryById = new Map(countryRows.map((r) => [r.country_id, r]));
  const cityByName = new Map(cityRows.map((r) => [r.name.toLowerCase(), r]));
  const cityById = new Map(cityRows.map((r) => [r.city_id, r]));

  const resolveCountryByName = (name) => (name ? countryByName.get(String(name).toLowerCase()) : undefined);

  const normalizedTravelDates = rawTravelDates.map((row) => {
    // Legacy shape: { travelDates, countriesToVisit: "India", notes }
    if (row.travelDates !== undefined || typeof row.countriesToVisit === "string") {
      const names = String(row.countriesToVisit || "")
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean);
      const resolved = [];
      const unresolved = [];
      names.forEach((name) => {
        const match = resolveCountryByName(name);
        if (match) resolved.push(match.country_id);
        else unresolved.push(name);
      });
      return {
        travel_date: row.travelDates,
        countries_to_visit: resolved,
        countries_to_visit_names: resolved.map((id) => countryById.get(id)?.name).filter(Boolean),
        ...(unresolved.length > 0 && { countries_to_visit_unresolved: unresolved }),
        notes: row.notes ?? null,
      };
    }

    return {
      travel_date: row.travel_date,
      countries_to_visit: row.countries_to_visit || [],
      countries_to_visit_names: (row.countries_to_visit || []).map((id) => countryById.get(id)?.name).filter(Boolean),
      notes: row.notes ?? null,
    };
  });

  const normalizedPreferences = rawPreferences.map((row) => {
    // Legacy shape: { destinationCountry: "India", applicationCity: "Mumbai" }
    if (row.destinationCountry !== undefined || row.applicationCity !== undefined) {
      const countryMatch = resolveCountryByName(row.destinationCountry);
      const cityMatch = row.applicationCity ? cityByName.get(String(row.applicationCity).toLowerCase()) : undefined;
      return {
        destination_country_id: countryMatch?.country_id ?? null,
        destination_country_name: countryMatch?.name ?? row.destinationCountry ?? null,
        application_city_id: cityMatch?.city_id ?? null,
        application_city_name: cityMatch?.name ?? row.applicationCity ?? null,
      };
    }

    const countryMatch = countryById.get(row.destination_country_id);
    const cityMatch = cityById.get(row.application_city_id);
    return {
      destination_country_id: row.destination_country_id,
      destination_country_name: countryMatch?.name ?? null,
      application_city_id: row.application_city_id,
      application_city_name: cityMatch?.name ?? null,
    };
  });

  return {
    success: true,
    data: {
      ...data,
      travel_dates: normalizedTravelDates,
      destination_preferences: normalizedPreferences,
    },
  };
};

/**
 * GET ALL TRAVEL INFO
 */
const getAllTravelInfo = async () => {
  const { supabase } = await db();

  const { data, error } = await supabase
    .from("travel_info")
    .select(TRAVEL_INFO_COLS);

  if (error) throw error;

  return { success: true, data };
};

module.exports = {
  saveTravelInfo,
  getTravelInfo,
  getAllTravelInfo,
};
