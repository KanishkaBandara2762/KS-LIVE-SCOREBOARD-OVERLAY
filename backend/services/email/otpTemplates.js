/**
 * KS Live — OTP email templates (HTML + plain text).
 * Brand name and colours are kept here so they are easy to change.
 */

const BRAND = {
  name: 'KS Live',
  tagline: 'Live Cricket Scoreboard & Broadcasting',
  primary: '#16a34a',
  dark: '#0b1220',
  card: '#111a2e',
  text: '#e2e8f0',
  muted: '#94a3b8',
};

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const PURPOSES = {
  signup: {
    subject: 'Verify your KS Live email',
    heading: 'Verify your email address',
    intro: 'Thanks for joining KS Live. Enter this code on the verification screen to activate your account.',
    footer: 'If you did not create a KS Live account, you can ignore this email.',
  },
  reset: {
    subject: 'Reset your KS Live password',
    heading: 'Reset your password',
    intro: 'We received a request to reset your KS Live password. Enter this code to continue.',
    footer: 'If you did not request a password reset, you can ignore this email. Your password will not change.',
  },
};

function buildOtpEmail({ purpose, code, displayName, expiryMinutes }) {
  const copy = PURPOSES[purpose];
  if (!copy) throw new Error(`Unknown OTP purpose: ${purpose}`);

  const name = displayName ? escapeHtml(displayName) : 'there';
  const digits = escapeHtml(code).split('').join(' ');

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${BRAND.name}</title></head>
<body style="margin:0;padding:0;background:${BRAND.dark};font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.dark};padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${BRAND.card};border-radius:14px;overflow:hidden;">
        <tr><td style="padding:28px 32px 8px;text-align:center;">
          <div style="font-size:22px;font-weight:700;color:${BRAND.primary};letter-spacing:.5px;">🏏 ${BRAND.name}</div>
          <div style="font-size:12px;color:${BRAND.muted};margin-top:4px;">${BRAND.tagline}</div>
        </td></tr>
        <tr><td style="padding:20px 32px 0;color:${BRAND.text};">
          <h1 style="font-size:20px;margin:0 0 12px;">${copy.heading}</h1>
          <p style="font-size:15px;line-height:1.6;margin:0 0 6px;">Hi ${name},</p>
          <p style="font-size:15px;line-height:1.6;margin:0;color:${BRAND.muted};">${copy.intro}</p>
        </td></tr>
        <tr><td align="center" style="padding:24px 32px;">
          <div style="display:inline-block;background:${BRAND.dark};border:1px solid ${BRAND.primary};border-radius:10px;padding:16px 22px;font-size:30px;font-weight:700;letter-spacing:6px;color:${BRAND.primary};font-family:'Courier New',monospace;">${digits.replace(/ /g, '&nbsp;&nbsp;')}</div>
          <p style="font-size:13px;color:${BRAND.muted};margin:16px 0 0;">This code expires in <strong style="color:${BRAND.text};">${expiryMinutes} minutes</strong>. Never share it with anyone.</p>
        </td></tr>
        <tr><td style="padding:0 32px 28px;color:${BRAND.muted};font-size:12px;line-height:1.6;border-top:1px solid #1e293b;padding-top:18px;">
          ${copy.footer}<br>&copy; ${new Date().getFullYear()} ${BRAND.name}. All rights reserved.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `${BRAND.name} — ${copy.heading}`,
    '',
    `Hi ${displayName || 'there'},`,
    copy.intro,
    '',
    `Your code: ${code}`,
    `It expires in ${expiryMinutes} minutes. Never share it with anyone.`,
    '',
    copy.footer,
  ].join('\n');

  return { subject: copy.subject, html, text };
}

module.exports = { buildOtpEmail, BRAND };
