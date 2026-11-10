/**
 * KS Live — OTP email templates (HTML + plain text).
 * Brand name and colours are kept here so they are easy to change.
 *
 * Email clients do not run JavaScript, so a button cannot copy to the clipboard.
 * The code is shown in a large selectable box; the user taps and holds it to copy.
 */

const BRAND = {
  name: 'KS Live',
  tagline: 'Live Cricket Scoreboard & Broadcasting',
  primary: '#16a34a',
  primaryText: '#052e16',
  page: '#f1f5f9',
  card: '#ffffff',
  codeBg: '#f0fdf4',
  text: '#0f172a',
  muted: '#475569',
  divider: '#e2e8f0',
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
    codeLabel: 'Your verification code',
    footer: 'If you did not create a KS Live account, you can ignore this email.',
  },
  reset: {
    subject: 'Reset your KS Live password',
    heading: 'Reset your password',
    intro: 'We received a request to reset your KS Live password. Enter this code to continue.',
    codeLabel: 'Your password reset code',
    footer: 'If you did not request a password reset, you can ignore this email. Your password will not change.',
  },
};

function buildOtpEmail({ purpose, code, displayName, expiryMinutes, copyUrl }) {
  const copy = PURPOSES[purpose];
  if (!copy) throw new Error(`Unknown OTP purpose: ${purpose}`);

  const name = displayName ? escapeHtml(displayName) : 'there';
  const plainCode = String(code);
  const safeCode = escapeHtml(plainCode);
  const safeCopyUrl = copyUrl ? escapeHtml(copyUrl) : '';
  const year = new Date().getFullYear();

  // Opens the site, which fills the code into the signup or forgot-password form.
  const verifyButton = safeCopyUrl
    ? `        <tr><td align="center" style="padding:20px 32px 4px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" class="ks-btn">
            <tr><td align="center" bgcolor="${BRAND.primary}" style="border-radius:12px;">
              <a href="${safeCopyUrl}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 34px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;color:${BRAND.primaryText};text-decoration:none;border-radius:12px;">Verify</a>
            </td></tr>
          </table>
        </td></tr>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="format-detection" content="telephone=no">
  <meta name="x-apple-disable-message-reformatting">
  <title>${BRAND.name}</title>
  <style>
    @media only screen and (max-width:480px) {
      .ks-card { width:100% !important; }
      .ks-pad { padding-left:20px !important; padding-right:20px !important; }
      .ks-code { font-size:30px !important; letter-spacing:8px !important; padding:16px 18px !important; }
      .ks-btn a { display:block !important; width:100% !important; box-sizing:border-box !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${BRAND.page};font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.page};padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ks-card" style="max-width:480px;background:${BRAND.card};border-radius:14px;overflow:hidden;">
        <tr><td class="ks-pad" style="padding:28px 32px 8px;text-align:center;">
          <div style="font-size:22px;font-weight:700;color:${BRAND.primary};letter-spacing:.5px;">🏏 ${BRAND.name}</div>
          <div style="font-size:12px;color:${BRAND.muted};margin-top:4px;">${BRAND.tagline}</div>
        </td></tr>
        <tr><td class="ks-pad" style="padding:20px 32px 0;color:${BRAND.text};">
          <h1 style="font-size:20px;margin:0 0 12px;">${copy.heading}</h1>
          <p style="font-size:15px;line-height:1.6;margin:0 0 6px;">Hi ${name},</p>
          <p style="font-size:15px;line-height:1.6;margin:0;color:${BRAND.muted};">${copy.intro}</p>
        </td></tr>
        <tr><td align="center" class="ks-pad" style="padding:24px 32px 6px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${BRAND.muted};margin-bottom:10px;">${copy.codeLabel}</div>
          <div class="ks-code" style="display:inline-block;background:${BRAND.codeBg};border:1px solid ${BRAND.primary};border-radius:12px;padding:18px 26px;font-size:34px;line-height:1;font-weight:700;letter-spacing:10px;color:${BRAND.primaryText};font-family:'Courier New',Courier,monospace;-webkit-user-select:all;user-select:all;mso-line-height-rule:exactly;">${safeCode}</div>
          <p style="font-size:13px;line-height:1.6;color:${BRAND.muted};margin:16px 0 0;">This code expires in <strong style="color:${BRAND.text};">${expiryMinutes} minutes</strong>. Never share it with anyone.</p>
        </td></tr>
${verifyButton}
        <tr><td style="padding:0 32px;"><div style="border-top:1px solid ${BRAND.divider};font-size:0;line-height:0;">&#8203;</div></td></tr>
        <tr><td class="ks-pad" style="padding:20px 32px 28px;color:${BRAND.muted};font-size:12px;line-height:1.6;">
          ${copy.footer}<br>&copy; ${year} ${BRAND.name}. All rights reserved.
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
    `Your code: ${plainCode}`,
    `It expires in ${expiryMinutes} minutes. Never share it with anyone.`,
    ...(safeCopyUrl ? ['', `Verify (fills the code for you): ${copyUrl}`] : []),
    '',
    copy.footer,
  ].join('\n');

  return { subject: copy.subject, html, text };
}

module.exports = { buildOtpEmail, BRAND };
