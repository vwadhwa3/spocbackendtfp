const express = require("express");
const router = express.Router();

const {
  createContactController,
} = require("../../controllers/Admin/bContact.controllers.js");

router.post("/create", createContactController);

module.exports = router;
