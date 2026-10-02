const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendEmailWithAttachments = async ({
  to,
  subject,
  text,
  attachments = [],
}) => {
  if (!to) {
    throw new Error("Recipient email is required.");
  }

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject,
    text,
    attachments,
  };

  return await transporter.sendMail(mailOptions);
};

module.exports = {
  sendEmailWithAttachments,
};
