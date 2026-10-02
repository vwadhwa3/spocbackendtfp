const express = require("express");

const router = express.Router();

const {
  submitAppointmentDetailsController,
  getAllApplicationsController,
  createAppointmentTaskController,
  createApplicationController,
} = require("../../controllers/Admin/b_application.controller");

// Submit Appointment Details(Appointment Monitoring Task)
router.put(
  "/:applicationId/submit-appointment-details",
  submitAppointmentDetailsController,
);

router.post("/:applicationId/appointment", createAppointmentTaskController);

// Get All Applications
router.get("/view", getAllApplicationsController);

// create routes
router.post("/create", createApplicationController);

module.exports = router;
