const express = require("express");
const router = express.Router();

const {
  sendSafeToDispatchDocumentsController,
} = require("../../controllers/System/safeToDispatch.controller");

router.post("/:application_id/send", sendSafeToDispatchDocumentsController);

module.exports = router;
