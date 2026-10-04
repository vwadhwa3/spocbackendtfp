const { loginService } = require("../services/auth.service");

// Login
const loginController = async (req, res) => {
  try {
    const result = await loginService(req.body ?? {});

    res.cookie("token", result.token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.error,
        message: error.message,
      });
    }

    console.error("Login error:", error);
    return res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: "Login failed",
    });
  }
};

// Verify Token
// authenticate has already checked the token and reloaded the user, so the
// role returned here is the one in the database, not the one in the token.
const verifyController = (req, res) =>
  res.json({
    success: true,
    data: { user: req.user },
  });

module.exports = {
  loginController,
  verifyController,
};
