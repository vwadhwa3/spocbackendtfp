const { transaction } = require("../utils/db");
const caseService = require("../services/caseService");

const createDiscount = async (req, res) => {
  try {
    const { case_id, amount, reason } = req.body;
    const userId = req.user.userId;
    
    const caseData = await caseService.getCaseById(case_id);
    if (!caseData) {
      return res.status(404).json({
        success: false,
        error: "CASE_NOT_FOUND",
        message: "Case not found",
      });
    }
    
    const result = await transaction(async (client) => {
      const discountResult = await client.query(
        `INSERT INTO discount (case_id, amount, currency_id, reason, status, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING discount_id, case_id, amount, currency_id, reason, status, created_at`,
        [case_id, amount, caseData.currency_id || 1, reason, "requested", userId]
      );
      
      return discountResult.rows[0];
    });
    
    return res.status(201).json({
      success: true,
      data: {
        discount: result,
        message: "Discount request created successfully. Pending approval.",
      },
    });
  } catch (error) {
    console.error("Create discount error:", error);
    return res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: "Failed to create discount request",
    });
  }
};

const getDiscountsByCase = async (req, res) => {
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
    
    const { queryMany } = require("../utils/db");
    const discounts = await queryMany(
      `SELECT d.*, u.first_name, u.last_name
       FROM discount d
       LEFT JOIN users u ON u.user_id = d.created_by_user_id
       WHERE d.case_id = $1
       ORDER BY d.created_at DESC`,
      [caseId]
    );
    
    return res.json({
      success: true,
      data: {
        case_id: caseId,
        discounts,
      },
    });
  } catch (error) {
    console.error("Get discounts error:", error);
    return res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: "Failed to get discounts",
    });
  }
};

module.exports = {
  createDiscount,
  getDiscountsByCase,
};