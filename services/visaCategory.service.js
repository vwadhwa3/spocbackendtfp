const { getSupabase } = require("../config/database");

const CODE_MAX_LENGTH = 50;
const NAME_MAX_LENGTH = 100;

const httpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const validateVisaCategory = ({ code, name, description }) => {
  const codeValue = code?.trim();
  const nameValue = name?.trim();

  if (!codeValue || !nameValue) {
    throw httpError(400, "Both 'code' and 'name' are required fields.");
  }

  if (codeValue.length > CODE_MAX_LENGTH) {
    throw httpError(400, `Code must be max ${CODE_MAX_LENGTH} characters.`);
  }

  if (nameValue.length > NAME_MAX_LENGTH) {
    throw httpError(400, `Name must be max ${NAME_MAX_LENGTH} characters.`);
  }

  return {
    code: codeValue.toUpperCase(),
    name: nameValue,
    description: description?.trim() || null,
  };
};

// Audit logging must never fail the request it is recording.
const writeSystemLog = async (supabase, actionType, details, actor) => {
  const { error } = await supabase.from("system_log").insert([
    {
      action_type: actionType,
      table_name: "VISA_CATEGORY",
      details,
      triggered_by: actor,
    },
  ]);

  if (error) {
    console.error("System log failure:", error.message);
  }
};

const findVisaCategory = async (supabase, id) => {
  const { data, error } = await supabase
    .from("visa_category")
    .select("visa_category_id, code")
    .eq("visa_category_id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw httpError(404, "Visa category not found.");

  return data;
};

// Get All Visa Categories
const getAllVisaCategoriesService = async () => {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("visa_category")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;

  return data;
};

// Create Visa Category
const createVisaCategoryService = async (body, actor) => {
  const supabase = getSupabase();
  const values = validateVisaCategory(body);

  const { data, error } = await supabase
    .from("visa_category")
    .insert([{ ...values, created_by: actor, updated_by: actor }])
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      throw httpError(409, "This visa category already exists.");
    }
    throw error;
  }

  await writeSystemLog(
    supabase,
    "CREATE",
    `Created visa category code: ${values.code}`,
    actor,
  );

  return data;
};

// Update Visa Category
const updateVisaCategoryService = async (id, body, actor) => {
  const supabase = getSupabase();
  const values = validateVisaCategory(body);

  await findVisaCategory(supabase, id);

  const { data, error } = await supabase
    .from("visa_category")
    .update({
      ...values,
      updated_by: actor,
      updation_timestamp: new Date().toISOString(),
    })
    .eq("visa_category_id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      throw httpError(409, "This visa category already exists.");
    }
    throw error;
  }

  await writeSystemLog(
    supabase,
    "UPDATE",
    `Updated visa category (${values.code})`,
    actor,
  );

  return data;
};

// Delete Visa Category
const deleteVisaCategoryService = async (id, actor) => {
  const supabase = getSupabase();

  const existing = await findVisaCategory(supabase, id);

  const { error } = await supabase
    .from("visa_category")
    .delete()
    .eq("visa_category_id", id);

  if (error) throw error;

  await writeSystemLog(
    supabase,
    "DELETE",
    `Deleted visa category (${existing.code})`,
    actor,
  );
};

module.exports = {
  getAllVisaCategoriesService,
  createVisaCategoryService,
  updateVisaCategoryService,
  deleteVisaCategoryService,
};
