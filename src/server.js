// ──────────────────────────────────────────────────────────────────────────
//  server.js
//  Webhook server that Bland.ai calls during/at the end of a call to create a
//  ServiceTitan booking. Bland's "Webhook" pathway node (or a custom tool)
//  POSTs the variables the agent extracted; we validate, book, and return a
//  short spoken confirmation string the agent can read back to the caller.
// ──────────────────────────────────────────────────────────────────────────

import "dotenv/config";
import express from "express";
import { createBooking } from "./servicetitan.js";

const app = express();
app.use(express.json({ limit: "256kb" }));

// --- Simple shared-secret auth so randoms can't hit your booking endpoint. ---
function authed(req) {
  const sent = req.get("x-emerald-secret");
  return sent && sent === process.env.WEBHOOK_SECRET;
}

// Strip anything that looks like sensitive cardholder data before it can ever
// be logged or forwarded. The agent collects no payment data at all (a team
// member follows up), so this is pure defense in depth: even if a caller
// volunteers card details and something upstream captured them, they're
// dropped here before logging or forwarding.
function scrubCardData(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const BANNED =
    /(credit_?card|card_?number|cardno|account_?number|pan|cvv|cvc|security_?code|expir)/i;
  for (const key of Object.keys(obj)) {
    if (BANNED.test(key)) {
      delete obj[key];
    } else if (typeof obj[key] === "object") {
      scrubCardData(obj[key]);
    }
  }
  return obj;
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/bland/book", async (req, res) => {
  if (!authed(req)) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  const body = scrubCardData(req.body || {});

  // Bland sends extracted pathway variables. Map them to our booking shape.
  // No payment data is collected on the call — a team member follows up to
  // take payment — so nothing card-related is expected or handled here.
  const call = {
    name: [body.first_name, body.last_name].filter(Boolean).join(" ").trim(),
    firstName: body.first_name,
    lastName: body.last_name,
    phone: body.callback_number || body.from,
    email: body.email,
    referralSource: body.referral_source,
    serviceType: body.service_type,
    summary: body.call_summary || body.service_type,
    preferredWindow: body.preferred_window,
    callId: body.call_id,
    address: {
      street: body.street,
      unit: body.unit,
      city: body.city,
      state: body.state,
      zip: body.zip,
    },
  };

  // Minimal validation — we need at least a name and a way to call back.
  if (!call.name || !call.phone) {
    return res.status(422).json({
      ok: false,
      // This string is what Bland will speak if you wire the failure branch.
      message:
        "I wasn't able to confirm your name and callback number — let me read those back to make sure I have them right.",
    });
  }

  try {
    const { bookingId } = await createBooking(call);
    console.log(`Booking created: #${bookingId} for ${call.name}`);
    return res.json({
      ok: true,
      booking_id: bookingId,
      // Spoken confirmation the agent can read back.
      message: `You're all set — I've got your request in for ${
        call.serviceType
      } and our office will confirm your ${
        call.preferredWindow || "appointment"
      }. A team member will be in touch shortly to collect your payment information and confirm your service. Anything else I can help with?`,
    });
  } catch (err) {
    console.error("Booking error:", err.message);
    return res.status(502).json({
      ok: false,
      message:
        "I'm having trouble reaching our scheduling system right now. Let me take your number and have a team member call you right back to lock in the time.",
    });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Emerald voice-agent webhook on :${port}`));
