const {
  getMyNotificationsService,
  markNotificationReadService,
} = require("../services/notification.service");

const sendError = (res, error) => {
  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      error: error.error,
      message: error.message,
    });
  }

  console.error("Notification Error:", error);
  return res.status(500).json({
    success: false,
    error: "INTERNAL_ERROR",
    message: "Something went wrong",
  });
};

const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (error) {
    sendError(res, error);
  }
};

const parseNotificationId = (req) => {
  const id = Number(req.params.notificationId);
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error("Notification ID must be a positive integer");
    error.statusCode = 400;
    error.error = "VALIDATION_ERROR";
    throw error;
  }
  return id;
};

// Get My Notifications
const getMyNotificationsController = handle(async (req, res) => {
  const data = await getMyNotificationsService(req.user.userId, {
    unreadOnly: req.query.unread === "true",
  });
  res.json({ success: true, data });
});

// Mark Notification Read
const markNotificationReadController = handle(async (req, res) => {
  const data = await markNotificationReadService(
    parseNotificationId(req),
    req.user.userId,
  );
  res.json({ success: true, data });
});

module.exports = {
  getMyNotificationsController,
  markNotificationReadController,
};
