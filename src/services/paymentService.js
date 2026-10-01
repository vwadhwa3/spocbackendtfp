const { query, queryOne, queryMany, transaction } = require("../utils/db");
const { toUTC, generateTimestamp } = require("../utils/dateUtils");
const { generatePaymentReference } = require("../utils/validators");

const createPayments = async (client, caseId, payments, userId) => {
  const createdPayments = [];
  
  for (const payment of payments) {
    const paymentTimestampUtc = toUTC(payment.local_payment_datetime, payment.timezone || "UTC");
    const paymentReference = generatePaymentReference(payment.bank_account_id);
    
    const result = await client.query(
      `INSERT INTO payment (
        case_id, bank_account_id, amount, currency_id, type, 
        local_payment_datetime, payment_timestamp_utc, payment_reference, 
        created_by_user_id, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING payment_id, case_id, bank_account_id, amount, currency_id, type,
                local_payment_datetime, payment_timestamp_utc, payment_reference,
                created_by_user_id, status, created_at`,
      [
        caseId,
        payment.bank_account_id,
        payment.amount,
        payment.currency_id,
        "initial_deposit",
        payment.local_payment_datetime,
        paymentTimestampUtc,
        paymentReference,
        userId,
        "pending",
      ]
    );
    
    createdPayments.push(result.rows[0]);
  }
  
  return createdPayments;
};

const updatePaymentsStatus = async (client, paymentIds, status) => {
  if (paymentIds.length === 0) return [];
  
  const placeholders = paymentIds.map((_, i) => `$${i + 2}`).join(", ");
  const result = await client.query(
    `UPDATE payment SET status = $1, updated_at = NOW() 
     WHERE payment_id IN (${placeholders})
     RETURNING payment_id, status`,
    [status, ...paymentIds]
  );
  
  return result.rows;
};

const getPaymentsByCaseId = async (caseId) => {
  const result = await queryMany(
    `SELECT p.*, ba.bank_name, ba.account_name
     FROM payment p
     LEFT JOIN bank_account ba ON ba.bank_account_id = p.bank_account_id
     WHERE p.case_id = $1
     ORDER BY p.created_at DESC`,
    [caseId]
  );
  
  return result;
};

const getPaymentById = async (paymentId) => {
  const result = await queryOne(
    `SELECT p.*, ba.bank_name, ba.account_name
     FROM payment p
     LEFT JOIN bank_account ba ON ba.bank_account_id = p.bank_account_id
     WHERE p.payment_id = $1`,
    [paymentId]
  );
  
  return result;
};

const checkBankAccountEnabled = async (bankAccountId) => {
  const result = await queryOne(
    `SELECT bank_account_id, bank_name, account_name, currency_id
     FROM bank_account
     WHERE bank_account_id = $1 AND enabled = true`,
    [bankAccountId]
  );
  
  return result;
};

const checkCurrencyExists = async (currencyId) => {
  const result = await queryOne(
    `SELECT currency_id, code, name FROM currency WHERE currency_id = $1`,
    [currencyId]
  );
  
  return result;
};

module.exports = {
  createPayments,
  updatePaymentsStatus,
  getPaymentsByCaseId,
  getPaymentById,
  checkBankAccountEnabled,
  checkCurrencyExists,
};