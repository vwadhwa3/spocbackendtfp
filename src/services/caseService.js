const { queryOne, queryMany, transaction } = require("../utils/db");

const getCaseById = async (caseId) => {
  const result = await queryOne(
    `SELECT c.*, cs.name as status_name
     FROM b_case c
     LEFT JOIN case_status cs ON cs.status_id = c.status_id
     WHERE c.case_id = $1`,
    [caseId]
  );
  
  return result;
};

const getCaseMinimumDeposit = async (caseId) => {
  const result = await queryOne(
    `SELECT 
       COALESCE(SUM(bcp.price_at_booking), 0) - COALESCE(c.discount_amount, 0) as minimum_deposit,
       c.discount_amount,
       c.minimum_deposit_amount,
       c.initial_deposit_received,
       c.balance_amount_due,
       c.status_id
     FROM b_case_service_pack bcp
     LEFT JOIN b_case c ON c.case_id = bcp.case_id
     WHERE bcp.case_id = $1 AND bcp.discontinued_at IS NULL
     GROUP BY c.case_id, c.discount_amount, c.minimum_deposit_amount, c.initial_deposit_received, c.balance_amount_due, c.status_id`,
    [caseId]
  );
  
  return result;
};

const getCaseWithDetails = async (caseId) => {
  const caseData = await getCaseById(caseId);
  if (!caseData) return null;
  
  const minimumDeposit = await getCaseMinimumDeposit(caseId);
  
  return {
    ...caseData,
    minimum_deposit_amount: minimumDeposit?.minimum_deposit || caseData.minimum_deposit_amount || 0,
    discount_amount: minimumDeposit?.discount_amount || caseData.discount_amount || 0,
  };
};

const updateCaseStatus = async (client, caseId, statusId, initialDepositReceived = null) => {
  const updates = ["status_id = $2", "updated_at = NOW()"];
  const params = [caseId, statusId];
  let paramIndex = 3;
  
  if (initialDepositReceived !== null) {
    updates.push(`initial_deposit_received = $${paramIndex}`);
    params.push(initialDepositReceived);
    paramIndex++;
  }
  
  const result = await client.query(
    `UPDATE b_case SET ${updates.join(", ")} WHERE case_id = $1 RETURNING *`,
    params
  );
  
  return result.rows[0];
};

const updateCaseDepositAmounts = async (client, caseId, totalDeposit, minimumDeposit) => {
  const balanceDue = Math.max(0, minimumDeposit - totalDeposit);
  
  const result = await client.query(
    `UPDATE b_case 
     SET initial_deposit_received = $2, 
         balance_amount_due = $3,
         updated_at = NOW()
     WHERE case_id = $1
     RETURNING *`,
    [caseId, totalDeposit, balanceDue]
  );
  
  return result.rows[0];
};

const checkCaseStatus = async (caseId, expectedStatusId) => {
  const result = await queryOne(
    `SELECT case_id, status_id FROM b_case WHERE case_id = $1`,
    [caseId]
  );
  
  if (!result) {
    return { exists: false, valid: false };
  }
  
  return {
    exists: true,
    valid: result.status_id === expectedStatusId,
    currentStatusId: result.status_id,
  };
};

const getEnabledBankAccounts = async () => {
  const result = await queryMany(
    `SELECT bank_account_id, bank_name, account_name, currency_id, account_number_last4
     FROM bank_account
     WHERE enabled = true
     ORDER BY bank_name, account_name`,
    []
  );
  
  return result;
};

module.exports = {
  getCaseById,
  getCaseMinimumDeposit,
  getCaseWithDetails,
  updateCaseStatus,
  updateCaseDepositAmounts,
  checkCaseStatus,
  getEnabledBankAccounts,
};