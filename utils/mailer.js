// utils/mailer.js
require("dotenv").config();
const nodemailer = require("nodemailer");

/* ===================== TRANSPORTER ===================== */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.user, // Gmail address
    pass: process.env.pass, // Gmail App Password
  },
});

/* ===================== GENERIC SENDER ===================== */
const sendEmail = async ({ to, subject, html }) => {
  try {
    await transporter.sendMail({
      from: `"Flying Panda 🐼✈️" <${process.env.user}>`,
      to,
      subject,
      html,
    });
  } catch (error) {
    // ❗ Never crash the API because of email failure
    console.error("Email send failed:", error.message);
  }
};

/* ===================== CONTACT FORM EMAIL ===================== */
const sendNotificationEmail = async (formData) => {
  return sendEmail({
    to: process.env.user, // send to yourself
    subject: "📩 New Contact Submission",
    html: `
      <h2>New Contact Submission</h2>
      <p><strong>Name:</strong> ${formData.name}</p>
      <p><strong>Email:</strong> ${formData.email}</p>
      <p><strong>Contact:</strong> ${formData.mobile}</p>
      <p><strong>Message:</strong> ${formData.message}</p>
      <p><strong>Received At:</strong> ${new Date().toLocaleString()}</p>
    `,
  });
};

/* ===================== ALERT / ABUSE / ANOMALY EMAIL ===================== */
const sendAlertEmail = async ({ title, details }) => {
  return sendEmail({
    to: process.env.user, // admin email
    subject: `🚨 Flying Panda Alert: ${title}`,
    html: `
      <h2 style="color:#d32f2f;">🚨 ${title}</h2>
      <pre style="
        background:#f5f5f5;
        padding:12px;
        border-radius:6px;
        font-size:14px;
      ">
${details}
      </pre>
      <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
    `,
  });
};

/* ===================== OPTIONAL: THROTTLED ALERT ===================== */
/*
  Prevents alert spam (default: 1 alert per 5 minutes)
*/
let lastAlertTime = 0;
const ALERT_COOLDOWN_MS = 5 * 60 * 1000;

const sendAlertEmailThrottled = async ({ title, details }) => {
  const now = Date.now();
  if (now - lastAlertTime > ALERT_COOLDOWN_MS) {
    lastAlertTime = now;
    await sendAlertEmail({ title, details });
  }
};

/* ===================== EXPORTS ===================== */
module.exports = {
  sendNotificationEmail,
  sendAlertEmail,
  sendAlertEmailThrottled,
};
