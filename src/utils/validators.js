const validator = require("validator");
const { isValidISODateTime, isNotFuture } = require("./dateUtils");

const validateAmount = (amount) => {
  if (amount === undefined || amount === null || amount === "") {
    return "Amount is required";
  }
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return "Amount must be a positive number";
  }
  if (!/^\d+(\.\d{1,2})?$/.test(amount.toString())) {
    return "Amount must have at most 2 decimal places";
  }
  return null;
};

const validateBankAccountId = (bankAccountId) => {
  if (bankAccountId === undefined || bankAccountId === null || bankAccountId === "") {
    return "Bank account ID is required";
  }
  const numId = parseInt(bankAccountId);
  if (isNaN(numId) || numId <= 0) {
    return "Bank account ID must be a positive integer";
  }
  return null;
};

const validateCurrencyId = (currencyId) => {
  if (currencyId === undefined || currencyId === null || currencyId === "") {
    return "Currency ID is required";
  }
  const numId = parseInt(currencyId);
  if (isNaN(numId) || numId <= 0) {
    return "Currency ID must be a positive integer";
  }
  return null;
};

const validateCaseId = (caseId) => {
  if (caseId === undefined || caseId === null || caseId === "") {
    return "Case ID is required";
  }
  const numId = parseInt(caseId);
  if (isNaN(numId) || numId <= 0) {
    return "Case ID must be a positive integer";
  }
  return null;
};

const validateLocalPaymentDateTime = (localPaymentDateTime, timeZone = "UTC") => {
  if (localPaymentDateTime === undefined || localPaymentDateTime === null || localPaymentDateTime === "") {
    return "Local payment datetime is required";
  }
  if (!isValidISODateTime(localPaymentDateTime)) {
    return "Invalid datetime format. Use ISO 8601 format (e.g., 2024-01-15T10:30:00+00:00)";
  }
  if (!isNotFuture(localPaymentDateTime, timeZone)) {
    return "Payment datetime cannot be in the future";
  }
  return null;
};

const validateDiscountAmount = (amount) => {
  if (amount === undefined || amount === null || amount === "") {
    return "Discount amount is required";
  }
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount < 0) {
    return "Discount amount must be a non-negative number";
  }
  if (!/^\d+(\.\d{1,2})?$/.test(amount.toString())) {
    return "Discount amount must have at most 2 decimal places";
  }
  return null;
};

const validateDiscountReason = (reason) => {
  if (reason === undefined || reason === null || reason === "") {
    return "Discount reason is required";
  }
  if (typeof reason !== "string" || reason.trim().length === 0) {
    return "Discount reason must be a non-empty string";
  }
  if (reason.length > 500) {
    return "Discount reason must not exceed 500 characters";
  }
  return null;
};

const validatePaymentArray = (payments) => {
  if (!Array.isArray(payments) || payments.length === 0) {
    return "At least one payment is required";
  }
  for (let i = 0; i < payments.length; i++) {
    const payment = payments[i];
    const errors = [];
    
    const amountError = validateAmount(payment.amount);
    if (amountError) errors.push({ field: `payments[${i}].amount`, message: amountError });
    
    const bankAccountError = validateBankAccountId(payment.bank_account_id);
    if (bankAccountError) errors.push({ field: `payments[${i}].bank_account_id`, message: bankAccountError });
    
    const currencyError = validateCurrencyId(payment.currency_id);
    if (currencyError) errors.push({ field: `payments[${i}].currency_id`, message: currencyError });
    
    const dateTimeError = validateLocalPaymentDateTime(payment.local_payment_datetime, payment.timezone);
    if (dateTimeError) errors.push({ field: `payments[${i}].local_payment_datetime`, message: dateTimeError });
    
    if (errors.length > 0) {
      return errors;
    }
  }
  return null;
};

const generatePaymentReference = (bankAccountId) => {
  return `BA${bankAccountId}-${Date.now()}`;
};

module.exports = {
  validateAmount,
  validateBankAccountId,
  validateCurrencyId,
  validateCaseId,
  validateLocalPaymentDateTime,
  validateDiscountAmount,
  validateDiscountReason,
  validatePaymentArray,
  generatePaymentReference,
};