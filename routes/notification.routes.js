const express = require("express");

const router = express.Router();

const { authenticate } = require("../middleware/auth.middleware");
const {
  getMyNotificationsController,
  markNotificationReadController,
} = require("../controllers/notification.controller");

// Mounted on /api/notifications, so router-level auth only gates these paths.
// Any staff user reads their own notifications; the service filters by
// recipient.
router.use(authenticate);

// Get My Notifications (?unread=true for unread only)
router.get("/", getMyNotificationsController);

// Mark Notification Read
router.patch("/:notificationId/read", markNotificationReadController);

module.exports = router;
