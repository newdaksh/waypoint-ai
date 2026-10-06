import nodemailer from 'nodemailer';
import { getConfig } from '../config.js';

let transport = null;
let transportKey = '';
let injected = null;

/** Test hook: capture outgoing mail instead of sending it. Pass nothing to restore. */
export const setMailSink = (fn) => {
  injected = fn || null;
};

function getTransport(smtp) {
  const key = JSON.stringify(smtp);
  if (!transport || transportKey !== key) {
    transport = nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.secure, auth: smtp.auth });
    transportKey = key;
  }
  return transport;
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** A small, widely-compatible (table + inline CSS) email in Waypoint's style. */
function render({ heading, paragraphs, button, footnote }) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3c4452">${escapeHtml(p)}</p>`).join('');
  const cta = button
    ? `<p style="margin:24px 0"><a href="${escapeHtml(button.url)}" style="display:inline-block;background:#3b5bdb;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 22px;border-radius:10px">${escapeHtml(button.label)}</a></p>
       <p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#6b7280">Or paste this link into your browser:<br><a href="${escapeHtml(button.url)}" style="color:#3b5bdb;word-break:break-all">${escapeHtml(button.url)}</a></p>`
    : '';
  const html = `<!doctype html><html><body style="margin:0;background:#f5f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border:1px solid #e5e7eb;border-radius:16px"><tr><td style="padding:32px">
<p style="margin:0 0 24px;font-size:17px;font-weight:700;color:#0f1218">&#9679; Waypoint</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#0f1218">${escapeHtml(heading)}</h1>
${body}${cta}
<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #eef0f3;font-size:12px;line-height:1.5;color:#8b93a1">${escapeHtml(footnote)}</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = [heading, '', ...paragraphs, ...(button ? ['', `${button.label}: ${button.url}`] : []), '', footnote].join('\n');
  return { html, text };
}

/**
 * Send an email. Without SMTP settings nothing leaves the machine: the message is printed to the server
 * console instead (so local development works), and `delivered` is false.
 */
export async function sendMail({ to, subject, ...content }) {
  const { html, text } = render(content);
  if (injected) {
    await injected({ to, subject, html, text, link: content.button?.url });
    return { delivered: true };
  }
  const { smtp } = getConfig().auth;
  if (!smtp) {
    console.log(`[mail] SMTP is not configured — not sending. To: ${to} | ${subject}${content.button ? `\n[mail]   ${content.button.label}: ${content.button.url}` : ''}`);
    return { delivered: false };
  }
  await getTransport(smtp).sendMail({ from: smtp.from, to, subject, html, text });
  return { delivered: true };
}

export const resetEmail = (url) => ({
  subject: 'Reset your Waypoint password',
  heading: 'Reset your password',
  paragraphs: ['We received a request to reset the password for your Waypoint account. This link works once and expires in 1 hour.'],
  button: { label: 'Choose a new password', url },
  footnote: "If you didn't ask for this, you can ignore this email — your password won't change.",
});

export const passwordChangedEmail = () => ({
  subject: 'Your Waypoint password was changed',
  heading: 'Your password was changed',
  paragraphs: ['The password for your Waypoint account was just changed, and you were signed out on all devices.'],
  footnote: "If this wasn't you, reset your password straight away from the login page.",
});
