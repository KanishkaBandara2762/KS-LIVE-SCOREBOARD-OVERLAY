/**
 * KS Live — Email Service
 * Sends transactional email (signup / password-reset OTP codes).
 *
 * Two delivery paths, chosen automatically from the environment:
 *   1. Brevo HTTPS API  — used when BREVO_API_KEY is set (recommended: works
 *      everywhere, no SMTP ports to unblock).
 *   2. Brevo SMTP relay — used when SMTP_* settings are present (nodemailer).
 *
 * EMAIL_FROM must be a sender verified in Brevo, written either as
 * `Name <user@example.com>` or as a plain address.
 *
 * Without usable settings:
 * - development: the message is written to the console (so OTP flows can be tested offline)
 * - production: sending fails loudly instead of silently dropping codes
 */

const nodemailer = require('nodemailer');

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const EMAIL_RE = /^\S+@\S+\.\S+$/;

let transporter = null;

const apiKey = () => String(process.env.BREVO_API_KEY || '').trim();

const smtpSettings = () => ({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
  from: process.env.EMAIL_FROM,
});

// `"KS Live <hi@example.com>"`, `KS Live <hi@example.com>` and `hi@example.com` all work.
function parseSender(value) {
  const raw = String(value || '').trim().replace(/^"(.*)"$/, '$1').trim();
  const match = /^(.*?)\s*<\s*([^<>]+)\s*>$/.exec(raw);
  const email = (match ? match[2] : raw).trim();
  const name = match ? match[1].trim().replace(/^"(.*)"$/, '$1').trim() : '';
  return { name, email };
}

const isPlaceholder = (s) =>
  /REPLACE_WITH/i.test(String(s.apiKey || '')) ||
  /REPLACE_WITH/i.test(String(s.user || '')) ||
  /REPLACE_WITH/i.test(String(s.from || ''));

const isEmailConfigured = () => {
  const s = { ...smtpSettings(), apiKey: apiKey() };
  if (isPlaceholder(s)) return false;
  if (!EMAIL_RE.test(parseSender(s.from).email)) return false;
  if (s.apiKey) return true;
  return Boolean(s.host && s.user && s.pass);
};

const getTransporter = () => {
  if (!transporter) {
    const s = smtpSettings();
    transporter = nodemailer.createTransport({
      host: s.host,
      port: s.port,
      secure: s.port === 465, // 587/2525 use STARTTLS
      auth: { user: s.user, pass: s.pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }
  return transporter;
};

async function sendViaApi({ to, subject, html, text }) {
  const sender = parseSender(process.env.EMAIL_FROM);
  const res = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'api-key': apiKey(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: sender.email, ...(sender.name ? { name: sender.name } : {}) },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.message || body.error || detail;
    } catch {
      /* keep the status code */
    }
    throw new Error(`Brevo API rejected the message: ${detail}`);
  }
  const info = await res.json().catch(() => ({}));
  return { delivered: true, messageId: info.messageId };
}

async function sendViaSmtp({ to, subject, html, text }) {
  const info = await getTransporter().sendMail({
    from: smtpSettings().from,
    to,
    subject,
    html,
    text,
  });
  return { delivered: true, messageId: info.messageId };
}

/**
 * @param {{ to: string, subject: string, html: string, text: string }} message
 */
async function sendEmail(message) {
  if (!isEmailConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Email delivery is not configured on the server.');
    }
    console.log(
      `[email:dev] To: ${message.to}\n[email:dev] Subject: ${message.subject}\n${message.text}`
    );
    return { delivered: false, devLogged: true };
  }

  try {
    return apiKey() ? await sendViaApi(message) : await sendViaSmtp(message);
  } catch (err) {
    // Provider details stay in server logs; clients get a generic error.
    throw new Error(`Email delivery failed: ${err.code || err.message}`);
  }
}

module.exports = { sendEmail, isEmailConfigured, parseSender };
