const { randomUUID } = require("node:crypto");
const { getSupabase } = require("../config/database");
const { withClient, withTransaction } = require("../utils/db.util");
const {
  t,
  isValidDateString,
  isPositiveInt,
} = require("../utils/validate.util");
const {
  DOCUMENT_KEY_RE,
  caseError,
  detectFileType,
  getTravelDocumentsBucket,
  insertRow,
  isValidPhone,
  normalizePhoneInput,
  validationError,
} = require("./case.service");
const { saveTravelInfoService } = require("./travelInfo.service");
const { saveVisaHistoryService } = require("./visaHistory.service");

// SPOC edits to one applicant on the customer page, one card at a time. Each
// section has a validator (body -> { errors, values }, no database) and a save.

const NAME_MAX_LENGTH = 100;
const DOCUMENT_NUMBER_MAX_LENGTH = 50;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const today = () => new Date().toISOString().slice(0, 10);

// Collects { field, message } errors and the cleaned value of each field.
const collector = (body) => {
  const errors = [];
  const add = (field, message) => errors.push({ field, message });

  const required = (field, label, max) => {
    const value = t(body[field]);
    if (!value) add(field, `${label} is required`);
    else if (max && String(value).length > max) {
      add(field, `${label} must be at most ${max} characters`);
    }
    return value;
  };
  const id = (field, label, { optional = false } = {}) => {
    if (optional && t(body[field]) == null) return null;
    if (!isPositiveInt(body[field])) {
      add(field, `${label} is required`);
      return null;
    }
    return Number(body[field]);
  };
  const date = (field, label, { optional = false } = {}) => {
    const value = t(body[field]);
    if (!value) {
      if (!optional) add(field, `${label} is required, format YYYY-MM-DD`);
      return null;
    }
    if (!isValidDateString(value)) {
      add(field, `${label} must be in the format YYYY-MM-DD`);
    }
    return value;
  };
  const phone = (field, label, { optional = false } = {}) => {
    if (optional && !t(body[field])) return null;
    if (!isValidPhone(body[field])) {
      add(field, `${label} must include the country code, e.g. +447900000000`);
      return null;
    }
    return normalizePhoneInput(body[field]);
  };
  const email = (field, label, { optional = false } = {}) => {
    const value = t(body[field]);
    if (!value) {
      if (!optional) add(field, `${label} is required`);
      return null;
    }
    if (!EMAIL_RE.test(value)) add(field, `${label} is not a valid email`);
    return value;
  };

  return { errors, add, required, id, date, phone, email };
};

/* ===================== VALIDATORS ===================== */

const validatePersonal = (body) => {
  const c = collector(body);
  const hadDifferentName = [true, 1, "1", "true"].includes(
    body.had_different_name,
  );
  const values = {
    first_name: c.required("first_name", "First name", NAME_MAX_LENGTH),
    surname: c.required("surname", "Surname", NAME_MAX_LENGTH),
    had_different_name: hadDifferentName ? 1 : 0,
    previous_name: hadDifferentName
      ? c.required("previous_name", "Previous name", NAME_MAX_LENGTH)
      : null,
    date_of_birth: c.date("date_of_birth", "Date of birth"),
    place_of_birth_id: c.id("place_of_birth_id", "Place of birth"),
    country_of_birth_id: c.id("country_of_birth_id", "Country of birth"),
    nationality_id: c.id("nationality_id", "Current nationality"),
    gender_id: c.id("gender_id", "Gender"),
    marital_status_id: c.id("marital_status_id", "Marital status"),
  };
  if (values.date_of_birth && values.date_of_birth >= today()) {
    c.add("date_of_birth", "Date of birth must be in the past");
  }
  return { errors: c.errors, values };
};

const validateTravelDocument = (body) => {
  const c = collector(body);
  const values = {
    travel_document_type: c.required(
      "travel_document_type",
      "Document type",
      50,
    ),
    travel_document_number: c.required(
      "travel_document_number",
      "Document number",
      DOCUMENT_NUMBER_MAX_LENGTH,
    ),
    issue_date: c.date("issue_date", "Date of issue"),
    expiry_date: c.date("expiry_date", "Valid until"),
  };
  if (values.issue_date && values.issue_date > today()) {
    c.add("issue_date", "Date of issue cannot be in the future");
  }
  if (
    values.issue_date &&
    values.expiry_date &&
    values.expiry_date <= values.issue_date
  ) {
    c.add("expiry_date", "Valid until must be after the date of issue");
  }
  return { errors: c.errors, values };
};

const validateAddress = (body) => {
  const c = collector(body);
  return {
    values: {
      postcode: c.required("postcode", "Post code"),
      address_line1: c.required("address_line1", "Address line 1"),
      address_line2: t(body.address_line2),
      city: c.required("city", "City"),
      county: c.required("county", "County"),
      country_id: c.id("country_id", "Country"),
      mobile_number: c.phone("mobile_number", "Mobile number"),
      whatsapp_number: c.phone("whatsapp_number", "WhatsApp number"),
      email: c.email("email", "Email"),
    },
    errors: c.errors,
  };
};

const validateResidencePermit = (body) => {
  const c = collector(body);
  const values = {
    permit_number: c.required(
      "permit_number",
      "Residence permit no. / Share code",
    ),
    permit_type_id: c.id("permit_type_id", "Residence status / Visa type"),
    issue_date: c.date("issue_date", "Date of issue", { optional: true }),
    expiry_date: c.date("expiry_date", "Valid until"),
  };
  if (
    values.issue_date &&
    values.expiry_date &&
    values.expiry_date <= values.issue_date
  ) {
    c.add("expiry_date", "Valid until must be after the date of issue");
  }
  return { errors: c.errors, values };
};

const validateOccupation = (body) => {
  const c = collector(body);
  const earnings = t(body.gross_annual_earnings);
  if (earnings != null && !(Number(earnings) >= 0)) {
    c.add("gross_annual_earnings", "Gross annual earnings must be a number");
  }
  return {
    values: {
      occupation_category: c.required(
        "occupation_category",
        "Employment status",
      ),
      employer_name: t(body.employer_name),
      job_title: t(body.job_title),
      start_date: c.date("start_date", "Date of joining", { optional: true }),
      employer_address: t(body.employer_address),
      employer_email: c.email("employer_email", "Email", { optional: true }),
      employer_phone: c.phone("employer_phone", "Contact number", {
        optional: true,
      }),
      gross_annual_earnings: earnings == null ? null : Number(earnings),
    },
    errors: c.errors,
  };
};

const validateFinancing = (body) => {
  const c = collector(body);
  return {
    values: {
      funding_source: c.required("funding_source", "Who will fund the trip"),
      sponsor_first_name: t(body.sponsor_first_name),
      sponsor_surname: t(body.sponsor_surname),
      sponsor_gender: t(body.sponsor_gender),
      sponsor_address: t(body.sponsor_address),
      sponsor_country_id: c.id("sponsor_country_id", "Country", {
        optional: true,
      }),
      sponsor_contact_number: c.phone(
        "sponsor_contact_number",
        "Mobile number",
        { optional: true },
      ),
      sponsor_email: c.email("sponsor_email", "Email", { optional: true }),
      sponsor_occupation_category: t(body.sponsor_occupation_category),
    },
    errors: c.errors,
  };
};

const validateAdditional = (body) => {
  const c = collector(body);
  const joins = body.joins_eu_family_member;
  if (![0, 1].includes(joins)) {
    c.add("joins_eu_family_member", "Select yes or no");
  }
  return {
    values: { joins_eu_family_member: joins, notes: t(body.notes) },
    errors: c.errors,
  };
};

/* ===================== DATABASE HELPERS ===================== */

const loadApplication = async (db, applicationId) => {
  if (!isPositiveInt(applicationId)) {
    throw validationError([
      { field: "applicationId", message: "Application ID must be a number" },
    ]);
  }
  const { rows } = await db.query(
    `select a.application_id, a.case_id, a.applicant_id, f.form_id
     from b_applications a
     left join lateral (
       select form_id from application_form
       where application_id = a.application_id and discontinued_at is null
       order by form_id desc limit 1
     ) f on true
     where a.application_id = $1 and a.discontinued_at is null`,
    [Number(applicationId)],
  );
  if (!rows[0]) {
    throw caseError(404, "APPLICATION_NOT_FOUND", "Application not found");
  }
  return rows[0];
};

// Starting the info form stage moves the application's status, and only for
// applications that have no form yet, so a form is never created from here.
const requireForm = (application) => {
  if (!application.form_id) {
    throw caseError(
      409,
      "INFO_FORM_NOT_STARTED",
      "This section can be edited once the info form stage has started",
    );
  }
  return application.form_id;
};

// Rejects ids that don't exist. `checks` is a list of [field, message, sql, value].
const checkExists = async (db, checks) => {
  const errors = [];
  for (const [field, message, sql, value] of checks) {
    if (value == null) continue;
    const { rowCount } = await db.query(sql, [value]);
    if (rowCount === 0) errors.push({ field, message });
  }
  if (errors.length > 0) throw validationError(errors);
};

const COUNTRY_SQL =
  "select 1 from country where country_id = $1 and discontinued_at is null";

const updateRow = async (db, table, idColumn, id, values, actor) => {
  const columns = Object.keys(values);
  const assignments = columns.map((c, i) => `${c} = $${i + 1}`);
  await db.query(
    `update ${table}
     set ${assignments.join(", ")},
         updated_by = $${columns.length + 1},
         updation_timestamp = now()
     where ${idColumn} = $${columns.length + 2}`,
    [...Object.values(values), actor, id],
  );
};

// A form has at most one live row per section: update it, or start it.
const saveFormSection = async (db, table, idColumn, formId, values, actor) => {
  const { rows } = await db.query(
    `select ${idColumn} as id from ${table}
     where form_id = $1 and discontinued_at is null
     order by ${idColumn} desc limit 1`,
    [formId],
  );
  if (rows[0]) return updateRow(db, table, idColumn, rows[0].id, values, actor);
  return insertRow(
    db,
    table,
    { form_id: formId, ...values, created_by: actor },
    idColumn,
  );
};

const validated = ({ errors, values }) => {
  if (errors.length > 0) throw validationError(errors);
  return values;
};

// The travel and visa services report errors with `status`, not `statusCode`.
const fromFormService = async (save) => {
  try {
    return (await save()).data;
  } catch (error) {
    if (!error.status) throw error;
    throw caseError(
      error.status,
      error.status === 404 ? "NOT_FOUND" : "VALIDATION_ERROR",
      error.message,
      error.validationErrors,
    );
  }
};

/* ===================== SECTIONS ===================== */

const saveSections = {
  personal: async (db, application, body, actor) => {
    const values = validated(validatePersonal(body));
    await checkExists(db, [
      [
        "country_of_birth_id",
        "Select a country of birth",
        COUNTRY_SQL,
        values.country_of_birth_id,
      ],
      [
        "nationality_id",
        "Select a nationality",
        COUNTRY_SQL,
        values.nationality_id,
      ],
      [
        "place_of_birth_id",
        "Select a place of birth",
        "select 1 from city where city_id = $1",
        values.place_of_birth_id,
      ],
      [
        "gender_id",
        "Select a gender",
        "select 1 from gender where gender_id = $1",
        values.gender_id,
      ],
      [
        "marital_status_id",
        "Select a marital status",
        "select 1 from marital_status where marital_status_id = $1",
        values.marital_status_id,
      ],
    ]);
    await updateRow(
      db,
      "b_contact",
      "contact_id",
      application.applicant_id,
      values,
      actor,
    );
  },

  "travel-document": async (db, application, body, actor) => {
    const values = validated(validateTravelDocument(body));
    await checkExists(db, [
      [
        "travel_document_type",
        "Select a document type",
        "select 1 from travel_doc_type where code = $1 and discontinued_at is null",
        values.travel_document_type,
      ],
    ]);
    await updateRow(
      db,
      "b_contact",
      "contact_id",
      application.applicant_id,
      values,
      actor,
    );
  },

  address: async (db, application, body, actor) => {
    const formId = requireForm(application);
    const values = validated(validateAddress(body));
    await checkExists(db, [
      ["country_id", "Select a country", COUNTRY_SQL, values.country_id],
    ]);
    await saveFormSection(
      db,
      "address_info",
      "address_info_id",
      formId,
      values,
      actor,
    );
  },

  "residence-permit": async (db, application, body, actor) => {
    const formId = requireForm(application);
    const values = validated(validateResidencePermit(body));
    await checkExists(db, [
      [
        "permit_type_id",
        "Select a residence status",
        "select 1 from permit_type where permit_type_id = $1",
        values.permit_type_id,
      ],
    ]);
    await saveFormSection(
      db,
      "residence_permit",
      "residence_permit_id",
      formId,
      values,
      actor,
    );
  },

  occupation: async (db, application, body, actor) => {
    const formId = requireForm(application);
    const values = validated(validateOccupation(body));
    await checkExists(db, [
      [
        "occupation_category",
        "Select an employment status",
        "select 1 from occupation_category where code = $1",
        values.occupation_category,
      ],
    ]);
    await saveFormSection(
      db,
      "occupation_info",
      "occupation_info_id",
      formId,
      values,
      actor,
    );
  },

  financing: async (db, application, body, actor) => {
    const formId = requireForm(application);
    const values = validated(validateFinancing(body));
    await checkExists(db, [
      [
        "funding_source",
        "Select who will fund the trip",
        "select 1 from funding_source where code = $1",
        values.funding_source,
      ],
      [
        "sponsor_country_id",
        "Select a country",
        COUNTRY_SQL,
        values.sponsor_country_id,
      ],
      [
        "sponsor_occupation_category",
        "Select a profession",
        "select 1 from occupation_category where code = $1",
        values.sponsor_occupation_category,
      ],
    ]);
    await saveFormSection(
      db,
      "financing_info",
      "financing_info_id",
      formId,
      values,
      actor,
    );
  },

  additional: async (db, application, body, actor) => {
    const formId = requireForm(application);
    const { joins_eu_family_member, notes } = validated(
      validateAdditional(body),
    );
    await saveFormSection(
      db,
      "financing_info",
      "financing_info_id",
      formId,
      { joins_eu_family_member },
      actor,
    );
    await saveFormSection(
      db,
      "other_info",
      "other_info_id",
      formId,
      { notes },
      actor,
    );
  },
};

// Patch Applicant Section
const updateApplicantSectionService = async (
  applicationId,
  section,
  body,
  userId,
) => {
  const save = saveSections[section];
  if (!save) throw caseError(404, "NOT_FOUND", "Unknown section");

  await withTransaction(async (db) => {
    const application = await loadApplication(db, applicationId);
    await save(db, application, body ?? {}, String(userId));
  });
  return { application_id: Number(applicationId), section };
};

// Patch Travel Info
const updateTravelInfoService = async (applicationId, body, userId) => {
  const application = await withClient((db) =>
    loadApplication(db, applicationId),
  );
  return fromFormService(() =>
    saveTravelInfoService({
      ...body,
      form_id: requireForm(application),
      updated_by: String(userId),
    }),
  );
};

// Patch Previous Visa
const updatePreviousVisaService = async (applicationId, body, userId) => {
  const application = await withClient((db) =>
    loadApplication(db, applicationId),
  );
  return fromFormService(() =>
    saveVisaHistoryService({
      ...body,
      form_id: requireForm(application),
      updated_by: String(userId),
    }),
  );
};

/* ===================== DOCUMENTS ===================== */

const isUrl = (value) => /^https?:\/\//i.test(value ?? "");

const parseDocumentKey = (documentKey) => {
  const match = DOCUMENT_KEY_RE.exec(String(documentKey ?? ""));
  if (!match) throw caseError(400, "VALIDATION_ERROR", "Unknown document");
  return { kind: match[1], id: Number(match[2]) };
};

const documentStorage = () =>
  getSupabase().storage.from(getTravelDocumentsBucket());

// Checked from the file's first bytes, then stored privately; the file is only
// reachable through GET /api/case/document/:documentKey.
const storeFile = async (file) => {
  const type = detectFileType(file?.buffer);
  if (!type) {
    throw validationError([
      { field: "file", message: "Document must be a PDF, JPG or PNG" },
    ]);
  }
  const path = `documents/${randomUUID()}.${type.ext}`;
  const { error } = await documentStorage().upload(path, file.buffer, {
    contentType: type.contentType,
    upsert: false,
  });
  if (error) throw error;
  return path;
};

const removeFile = async (path) => {
  if (!path || isUrl(path)) return;
  const { error } = await documentStorage().remove([path]);
  if (error) console.error("Could not remove stored document:", error);
};

// Runs write(path) with the file stored, and takes the file back out if the
// write fails, so a failed save leaves nothing behind.
const withStoredFile = async (file, write) => {
  const path = await storeFile(file);
  try {
    return await write(path);
  } catch (error) {
    await removeFile(path);
    throw error;
  }
};

const documentFields = (body) => {
  const c = collector(body);
  return {
    values: {
      document_name: c.required("document_name", "Document name", 255),
      document_type_id: c.id("document_type_id", "Document type"),
    },
    errors: c.errors,
  };
};

const checkDocumentType = (db, documentTypeId) =>
  checkExists(db, [
    [
      "document_type_id",
      "Select a document type",
      "select 1 from document_type where document_type_id = $1 and discontinued_at is null",
      documentTypeId,
    ],
  ]);

// Upload Document
const uploadDocumentService = async (applicationId, body, file, userId) => {
  const { document_name, document_type_id } = validated(
    documentFields(body ?? {}),
  );
  if (!file) {
    throw validationError([
      { field: "file", message: "Document file is required" },
    ]);
  }

  const { application } = await withClient(async (db) => {
    await checkDocumentType(db, document_type_id);
    return { application: await loadApplication(db, applicationId) };
  });

  return withStoredFile(file, (path) =>
    withClient(async (db) => {
      const row = await insertRow(
        db,
        "attachment",
        {
          case_id: application.case_id,
          application_id: application.application_id,
          document_type_id,
          file_name: document_name,
          file_path: path,
          url_path: path,
          uploaded_by_customer: 0,
          uploaded_by_user_id: userId,
          created_by: String(userId),
        },
        "attachment_id",
      );
      return { document_key: `attachment-${row.attachment_id}` };
    }),
  );
};

// Patch Document
//
// Attachments can be renamed, retyped and replaced. A travel document's name
// and type come from the contact, so only its file can change here.
const updateDocumentService = async (documentKey, body, file, userId) => {
  const { kind, id } = parseDocumentKey(documentKey);
  const actor = String(userId);

  if (kind === "travel-document") {
    if (!file) {
      throw validationError([
        { field: "file", message: "Document file is required" },
      ]);
    }
    const { rows } = await withClient((db) =>
      db.query(
        `select travel_document_file_path as path from b_contact
         where contact_id = $1 and discontinued_at is null`,
        [id],
      ),
    );
    if (!rows[0])
      throw caseError(404, "DOCUMENT_NOT_FOUND", "Document not found");

    await withStoredFile(file, (path) =>
      withClient((db) =>
        updateRow(
          db,
          "b_contact",
          "contact_id",
          id,
          { travel_document_file_path: path },
          actor,
        ),
      ),
    );
    await removeFile(rows[0].path);
    return { document_key: documentKey };
  }

  const { document_name, document_type_id } = validated(
    documentFields(body ?? {}),
  );
  const { rows } = await withClient(async (db) => {
    await checkDocumentType(db, document_type_id);
    return db.query(
      `select url_path as path from attachment
       where attachment_id = $1 and discontinued_at is null`,
      [id],
    );
  });
  if (!rows[0])
    throw caseError(404, "DOCUMENT_NOT_FOUND", "Document not found");

  const values = { file_name: document_name, document_type_id };
  const write = (extra) =>
    withClient((db) =>
      updateRow(
        db,
        "attachment",
        "attachment_id",
        id,
        { ...values, ...extra },
        actor,
      ),
    );

  if (!file) {
    await write({});
  } else {
    await withStoredFile(file, (path) =>
      write({ file_path: path, url_path: path }),
    );
    await removeFile(rows[0].path);
  }
  return { document_key: documentKey };
};

// Delete Document
//
// Attachments are only marked as discontinued, like every other record, so the
// file stays in storage. A travel document is required for the case, so it can
// be replaced but not deleted.
const deleteDocumentService = async (documentKey, userId) => {
  const { kind, id } = parseDocumentKey(documentKey);
  if (kind === "travel-document") {
    throw caseError(
      400,
      "VALIDATION_ERROR",
      "A travel document can be replaced but not deleted",
    );
  }

  const { rowCount } = await withClient((db) =>
    db.query(
      `update attachment
       set discontinued_at = now(), discontinued_by = $1
       where attachment_id = $2 and discontinued_at is null`,
      [String(userId), id],
    ),
  );
  if (rowCount === 0)
    throw caseError(404, "DOCUMENT_NOT_FOUND", "Document not found");
  return { document_key: documentKey };
};

module.exports = {
  updateApplicantSectionService,
  updateTravelInfoService,
  updatePreviousVisaService,
  uploadDocumentService,
  updateDocumentService,
  deleteDocumentService,
  validatePersonal,
  validateTravelDocument,
  validateAddress,
  validateResidencePermit,
  validateOccupation,
  validateFinancing,
  validateAdditional,
};
