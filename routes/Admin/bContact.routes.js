const express = require("express");
const router = express.Router();

const {
  createContactController,
} = require("../../controllers/Admin/bContact.controller");

router.post("/create", createContactController);

module.exports = router;
