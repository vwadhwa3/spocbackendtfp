const {
  getAllUsersService,
  createUserService,
} = require("../../services/Admin/user.service");

// Get All Users
const getAllUsersController = async (req, res) => {
  try {
    const result = await getAllUsersService();

    return res.status(200).json({
      success: true,
      message: "User list fetched successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Get All Users Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// Create User
const createUserController = async (req, res) => {
  try {
    const result = await createUserService(req.body);

    return res.status(201).json({
      success: true,
      message: "User created successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Create User Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

module.exports = {
  getAllUsersController,
  createUserController,
};
