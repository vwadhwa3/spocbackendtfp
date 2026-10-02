const { transaction } = require("../utils/db");
const paymentService = require("../services/paymentService");
const caseService = require("../services/caseService");
const applicationService = require("../services/applicationService");

const CASE_STATUS = {
  PENDING_INITIAL_DEPOSIT: 1,
  DEPOSIT_AMOUNT_REVIEW: 2,
  CASE_CREATED: 3,
};

const APPLICATION_STATUS = {
  APPLICATION_CREATED: 5,
};

const getEnabledBankAccounts = async (req, res) => {
  try {
    const bankAccounts = await paymentService.getEnabledBankAccounts();

    return res.json({
      success: true,
      data: bankAccounts,
    });
  } catch (error) {
    console.error("Get enabled bank accounts error:", error);
    return res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: "Failed to get enabled bank accounts",
    });
  }
};

const getMinimumDeposit = async (req, res) => {
  try {
    const { caseId } = req.params;
    
    const caseData = await caseService.getCaseById(caseId);
    if (!caseData) {
      return res.status(404).json({
        success: false,
        error: "CASE_NOT_FOUND",
        message: "Case not found",
      });
    }
    
    const minimumDeposit = await caseService.getCaseMinimumDeposit(caseId);
    
    return res.json({
      success: true,
      data: {
        case_id: caseId,
        minimum_deposit_amount: minimumDeposit?.minimum_deposit || 0,
        discount_amount: minimumDeposit?.discount_amount || 0,
        initial_deposit_received: minimumDeposit?.initial_deposit_received || 0,
        balance_amount_due: minimumDeposit?.balance_amount_due || 0,
        status_id: minimumDeposit?.status_id,
        status_name: caseData.status_name,
      },
    });
  } catch (error) {
    console.error("Get minimum deposit error:", error);
    return res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: "Failed to get minimum deposit",
    });
  }
};

const submitDeposit = async (req, res) => {
  try {
    const { caseId } = req.params;
    const { payments } = req.body;
    const userId = req.user.userId;
    const userTimezone = req.user.timezone || "UTC";
    
    const caseCheck = await caseService.checkCaseStatus(caseId, CASE_STATUS.PENDING_INITIAL_DEPOSIT);
    if (!caseCheck.exists) {
      return res.status(404).json({
        success: false,
        error: "CASE_NOT_FOUND",
        message: "Case not found",
      });
    }
    
    if (!caseCheck.valid) {
      return res.status(400).json({
        success: false,
        error: "INVALID_CASE_STATUS",
        message: `Case must be in "Pending Initial Deposit" status. Current status: ${caseCheck.currentStatusId}`,
        current_status_id: caseCheck.currentStatusId,
      });
    }
    
    for (const payment of payments) {
      const bankAccount = await paymentService.checkBankAccountEnabled(payment.bank_account_id);
      if (!bankAccount) {
        return res.status(400).json({
          success: false,
          error: "INVALID_BANK_ACCOUNT",
          message: `Bank account ${payment.bank_account_id} not found or disabled`,
          bank_account_id: payment.bank_account_id,
        });
      }
      
      const currency = await paymentService.checkCurrencyExists(payment.currency_id);
      if (!currency) {
        return res.status(400).json({
          success: false,
          error: "INVALID_CURRENCY",
          message: `Currency ${payment.currency_id} not found`,
          currency_id: payment.currency_id,
        });
      }
      
      payment.timezone = userTimezone;
    }
    
    const minimumDepositData = await caseService.getCaseMinimumDeposit(caseId);
    const minimumDeposit = minimumDepositData?.minimum_deposit || 0;
    
    const result = await transaction(async (client) => {
      const createdPayments = await paymentService.createPayments(client, caseId, payments, userId);
      
      const totalAmount = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
      
      const paymentIds = createdPayments.map(p => p.payment_id);
      
      if (totalAmount >= minimumDeposit) {
        await paymentService.updatePaymentsStatus(client, paymentIds, "approved");
        await caseService.updateCaseStatus(client, caseId, CASE_STATUS.CASE_CREATED, totalAmount);
        await applicationService.updateApplicationsStatus(client, caseId, APPLICATION_STATUS.APPLICATION_CREATED);
        await applicationService.allocateDepositToApplications(client, caseId, totalAmount);
        
        return {
          status: "approved",
          case_status: CASE_STATUS.CASE_CREATED,
          total_deposit: totalAmount,
          minimum_deposit: minimumDeposit,
          meets_minimum: true,
          payments: createdPayments,
        };
      } else {
        await caseService.updateCaseStatus(client, caseId, CASE_STATUS.DEPOSIT_AMOUNT_REVIEW, totalAmount);
        await caseService.updateCaseDepositAmounts(client, caseId, totalAmount, minimumDeposit);
        
        return {
          status: "pending",
          case_status: CASE_STATUS.DEPOSIT_AMOUNT_REVIEW,
          total_deposit: totalAmount,
          minimum_deposit: minimumDeposit,
          meets_minimum: false,
          shortfall: minimumDeposit - totalAmount,
          payments: createdPayments,
        };
      }
    });
    
    return res.status(201).json({
      success: true,
      data: {
        case_id: caseId,
        ...result,
        message: result.meets_minimum 
          ? "Deposit submitted successfully. Case created and applications activated." 
          : `Deposit submitted but amount (${result.total_deposit}) is below minimum required (${result.minimum_deposit}). Shortfall: ${result.shortfall}. Case status: Deposit Amount Review.`,
      },
    });
  } catch (error) {
    console.error("Submit deposit error:", error);
    return res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: "Failed to submit deposit",
    });
  }
};

const getPayments = async (req, res) => {
  try {
    const { caseId } = req.params;
    
    const caseData = await caseService.getCaseById(caseId);
    if (!caseData) {
      return res.status(404).json({
        success: false,
        error: "CASE_NOT_FOUND",
        message: "Case not found",
      });
    }
    
    const payments = await paymentService.getPaymentsByCaseId(caseId);
    
    return res.json({
      success: true,
      data: {
        case_id: caseId,
        payments,
      },
    });
  } catch (error) {
    console.error("Get payments error:", error);
    return res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: "Failed to get payments",
    });
  }
};

module.exports = {
  getEnabledBankAccounts,
  getMinimumDeposit,
  submitDeposit,
  getPayments,
};