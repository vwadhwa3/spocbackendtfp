const { getSupabase } = require("../config/database");

const LIST_LIMIT = 50;

const notificationError = (statusCode, error, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.error = error;
  return err;
};

const run = async (request) => {
  const { data, error } = await request;
  if (error) throw error;
  return data;
};

const FIELDS =
  "notification_id, case_id, task_id, notification_code, event_type, message, channel, is_read, read_at, creation_timestamp";

// Get My Notifications
//
// Only the recipient's own rows, newest first.
const getMyNotificationsService = async (userId, { unreadOnly }) => {
  let query = getSupabase()
    .from("notification")
    .select(FIELDS)
    .eq("recipient_user_id", userId)
    .is("discontinued_at", null)
    .order("creation_timestamp", { ascending: false })
    .limit(LIST_LIMIT);
  if (unreadOnly) query = query.eq("is_read", 0);
  return run(query);
};

// Mark Notification Read
//
// Someone else's notification is reported as not found, not forbidden, so
// ids can't be probed.
const markNotificationReadService = async (notificationId, userId) => {
  const rows = await run(
    getSupabase()
      .from("notification")
      .update({
        is_read: 1,
        read_at: new Date().toISOString(),
        updated_by: String(userId),
        updation_timestamp: new Date().toISOString(),
      })
      .eq("notification_id", notificationId)
      .eq("recipient_user_id", userId)
      .is("discontinued_at", null)
      .select(FIELDS),
  );
  if (rows.length === 0) {
    throw notificationError(
      404,
      "NOTIFICATION_NOT_FOUND",
      "Notification not found",
    );
  }
  return rows[0];
};

module.exports = {
  getMyNotificationsService,
  markNotificationReadService,
};
