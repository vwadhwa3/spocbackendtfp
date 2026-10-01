const { queryMany, queryOne } = require("../utils/db");

const getApplicationsByCaseId = async (caseId) => {
  const result = await queryMany(
    `SELECT a.*, ast.name as status_name
     FROM b_applications a
     LEFT JOIN application_status ast ON ast.status_id = a.status_id
     WHERE a.case_id = $1
     ORDER BY a.created_at`,
    [caseId]
  );
  
  return result;
};

const updateApplicationsStatus = async (client, caseId, statusId) => {
  const result = await client.query(
    `UPDATE b_applications 
     SET status_id = $2, updated_at = NOW()
     WHERE case_id = $1
     RETURNING application_id, status_id`,
    [caseId, statusId]
  );
  
  return result.rows;
};

const getApplicationCount = async (caseId) => {
  const result = await queryOne(
    `SELECT COUNT(*) as count FROM b_applications WHERE case_id = $1`,
    [caseId]
  );
  
  return parseInt(result?.count || 0);
};

const updateApplicationAllocatedDeposit = async (client, applicationId, allocatedAmount) => {
  const result = await client.query(
    `UPDATE b_applications 
     SET allocated_deposit_amount = $2, updated_at = NOW()
     WHERE application_id = $1
     RETURNING application_id, allocated_deposit_amount`,
    [applicationId, allocatedAmount]
  );
  
  return result.rows[0];
};

const allocateDepositToApplications = async (client, caseId, totalDeposit) => {
  const applications = await getApplicationsByCaseId(caseId);
  
  if (applications.length === 0) {
    return { applications: [], depositPerApplication: 0 };
  }
  
  const depositPerApplication = totalDeposit / applications.length;
  const updatedApplications = [];
  
  for (const app of applications) {
    const updated = await updateApplicationAllocatedDeposit(client, app.application_id, depositPerApplication);
    updatedApplications.push(updated);
  }
  
  return {
    applications: updatedApplications,
    depositPerApplication,
    applicationCount: applications.length,
  };
};

module.exports = {
  getApplicationsByCaseId,
  updateApplicationsStatus,
  getApplicationCount,
  updateApplicationAllocatedDeposit,
  allocateDepositToApplications,
};