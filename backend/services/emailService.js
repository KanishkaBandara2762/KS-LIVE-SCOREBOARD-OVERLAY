/**
 * KS Live — Email Service
 * Sends transactional email through Brevo over SMTP (nodemailer).
 * All credentials come from environment variables:
 * SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM.
 *
 * Without SMTP settings:
 * - development: the message is written to the console (so OTP flows can be tested offline)
 * - production: sending fails loudly instead of silently dropping codes
 */

const nodemailer = require('nodemailer');

let transporter = null;

const smtpSettings = () => ({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
  from: process.env.EMAIL_FROM,
});

const isEmailConfigured = () => {
  const s = smtpSettings();
  return Boolean(s.host && s.user && s.pass && s.from && !isPlaceholder(s));
};

// Guards against sending with the unedited .env.example / .env placeholders.
const isPlaceholder = (s) =>
  [s.user, s.from].some((value) => /REPLACE_WITH/i.test(String(value)));

const getTransporter = () => {
  if (!transporter) {
    const s = smtpSettings();
    transporter = nodemailer.createTransport({
      host: s.host,
      port: s.port,
      secure: s.port === 465, // 587 uses STARTTLS
      auth: { user: s.user, pass: s.pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }
  return transporter;
};

/**
 * @param {{ to: string, subject: string, html: string, text: string }} message
 */
async function sendEmail({ to, subject, html, text }) {
  if (!isEmailConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Email delivery is not configured on the server.');
    }
    console.log(`[email:dev] To: ${to}\n[email:dev] Subject: ${subject}\n${text}`);
    return { delivered: false, devLogged: true };
  }

  try {
    const info = await getTransporter().sendMail({
      from: smtpSettings().from,
      to,
      subject,
      html,
      text,
    });
    return { delivered: true, messageId: info.messageId };
  } catch (err) {
    // Provider details stay in server logs; clients get a generic error.
    throw new Error(`SMTP delivery failed: ${err.code || err.message}`);
  }
}

module.exports = { sendEmail, isEmailConfigured };
