const caseService = require("../services/caseService");

const getEnabledBankAccounts = async (req, res) => {
  try {
    const bankAccounts = await caseService.getEnabledBankAccounts();
    
    const formattedAccounts = bankAccounts.map(account => ({
      bank_account_id: account.bank_account_id,
      bank_name: account.bank_name,
      account_name: account.account_name,
      currency_id: account.currency_id,
      account_number_last4: account.account_number_last4,
      display_name: `${account.bank_name} - ${account.account_name} (${account.account_number_last4 || "****"})`,
    }));
    
    return res.json({
      success: true,
      data: {
        bank_accounts: formattedAccounts,
      },
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

module.exports = {
  getEnabledBankAccounts,
};