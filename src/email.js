// ──────────────────────────────────────────────────────────────────────────
//  email.js
//  Sends a booking-notification email (e.g. to workorders@emerald911.com) after
//  a ServiceTitan booking is created. Uses SMTP via nodemailer so it works with
//  Google Workspace, Microsoft 365, or any mail host. Configure the SMTP_* and
//  NOTIFY_EMAIL vars in the environment (Render dashboard -> Environment).
//
//  No payment/card data is ever included — none is collected on the call, and
//  the server scrubs anything card-like before this point.
// ──────────────────────────────────────────────────────────────────────────

import nodemailer from "nodemailer";

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null; // not configured
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465, // true for 465, false for 587/STARTTLS
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return transporter;
}

/**
 * Email a summary of the call/booking to the workorders inbox.
 * @param {object} call    The mapped call data from server.js
 * @param {number|string} bookingId  ServiceTitan booking id (if created)
 */
export async function sendBookingEmail(call, bookingId) {
  const t = getTransporter();
  if (!t) throw new Error("SMTP not configured (set SMTP_HOST etc.)");

  const to = process.env.NOTIFY_EMAIL || "workorders@emerald911.com";
  const from =
    process.env.FROM_EMAIL || process.env.SMTP_USER || "no-reply@emerald911.com";

  const addr = call.address || {};
  const addressLine = [
    addr.street,
    addr.unit ? `Unit ${addr.unit}` : null,
    [addr.city, addr.state].filter(Boolean).join(", "),
    addr.zip,
  ]
    .filter(Boolean)
    .join(", ");

  const lines = [
    `New booking from the AI phone agent`,
    bookingId ? `ServiceTitan booking #: ${bookingId}` : `(ServiceTitan booking NOT created — see logs)`,
    ``,
    `Name:            ${call.name || "(missing)"}`,
    `Phone:           ${call.phone || "(missing)"}`,
    `Email:           ${call.email || "-"}`,
    `Service:         ${call.serviceType || "-"}`,
    `Service address: ${addressLine || "-"}`,
    `Preferred time:  ${call.preferredWindow || "-"}`,
    `Heard about us:  ${call.referralSource || "-"}`,
    `Other issues:    ${call.additionalIssues || "none"}`,
    ``,
    `Notes: ${call.summary || "-"}`,
    `Payment: not collected on call — team to follow up within the hour to confirm time and take payment.`,
    `Bland call id: ${call.callId || "-"}`,
  ];

  await t.sendMail({
    from,
    to,
    subject: `New service request — ${call.name || "Unknown"} — ${call.serviceType || "Plumbing"}`,
    text: lines.join("\n"),
  });
}
