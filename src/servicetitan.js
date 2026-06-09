// ──────────────────────────────────────────────────────────────────────────
//  servicetitan.js
//  Minimal ServiceTitan API client.
//
//  Uses the CRM "Bookings" endpoint, which is purpose-built for phone/lead
//  intake. A booking lands in the ServiceTitan "Call Booking" queue where your
//  office staff (or Dispatch automation) convert it into a scheduled job. This
//  is deliberately chosen over the full Jobs API because it does NOT require
//  resolving tenant-specific job-type / business-unit / technician IDs at call
//  time — the agent just captures who, where, what, and when.
//
//  NOTE ON API DRIFT: ServiceTitan versions its endpoints and occasionally
//  changes required fields. The shapes below reflect the v2 CRM API as of
//  early 2026. Verify field names and the exact booking route against
//  https://developer.servicetitan.io before going live.
// ──────────────────────────────────────────────────────────────────────────

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  // Reuse the token until ~60s before it expires.
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.ST_CLIENT_ID,
    client_secret: process.env.ST_CLIENT_SECRET,
  });

  const res = await fetch(process.env.ST_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ServiceTitan auth failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

/**
 * Create a booking (lead) in ServiceTitan from the data the voice agent
 * collected on the call.
 *
 * @param {object} call
 * @param {string} call.name              Caller full name
 * @param {string} call.phone             Callback number (E.164 preferred)
 * @param {string} [call.email]
 * @param {string} call.serviceType       e.g. "Septic Tank Pumping"
 * @param {string} call.summary           Free-text recap of the request
 * @param {object} [call.address]         { street, unit, city, state, zip }
 * @param {string} [call.preferredWindow] e.g. "Thursday morning"
 * @param {string} [call.callId]          Bland call id, stored as externalId
 * @returns {Promise<{bookingId: number}>}
 */
export async function createBooking(call) {
  const token = await getAccessToken();
  const tenant = process.env.ST_TENANT_ID;
  const provider = process.env.ST_BOOKING_PROVIDER_ID;

  const url =
    `${process.env.ST_API_BASE}/crm/v2/tenant/${tenant}` +
    `/booking-provider/${provider}/bookings`;

  // We intentionally do NOT send any payment-card fields here. See the README
  // "Payment / PCI" section — card capture must not flow through this webhook.
  const payload = {
    source: call.referralSource || "Inbound Call — AI Agent",
    summary: call.summary,
    callReason: call.serviceType,
    isFirstTime: true,
    name: call.name,
    address: call.address
      ? {
          street: call.address.street,
          unit: call.address.unit || undefined,
          city: call.address.city,
          state: call.address.state,
          zip: call.address.zip,
          country: "USA",
        }
      : undefined,
    customerType: "Residential",
    contacts: [
      call.phone ? { type: "Phone", value: call.phone } : null,
      call.email ? { type: "Email", value: call.email } : null,
    ].filter(Boolean),
    externalId: call.callId || undefined,
    // Free-text note the office sees. Put the scheduling preference + recap here
    // so a human can confirm the exact window when converting to a job.
    customerNotes: [
      call.preferredWindow ? `Preferred window: ${call.preferredWindow}` : null,
      call.referralSource ? `Heard about us: ${call.referralSource}` : null,
      "Payment: NOT collected on call — team member to follow up to collect payment and confirm service.",
      call.summary ? `Caller notes: ${call.summary}` : null,
      "Diagnostic fee waived if customer proceeds with service on site.",
    ]
      .filter(Boolean)
      .join("\n"),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "ST-App-Key": process.env.ST_APP_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ServiceTitan booking failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return { bookingId: data.id ?? data.bookingId };
}
