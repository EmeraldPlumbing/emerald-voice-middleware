# Emerald Plumbing — AI Inbound Voice Agent

An inbound-call agent that answers using your existing phone scripts, vets the
caller, and books the job into ServiceTitan. Calls arrive on **RingCentral**,
get forwarded to a **Bland.ai** AI number, the AI runs your **script as a
conversation pathway**, and when the caller is ready it calls this project's
**webhook**, which creates a **ServiceTitan booking**.

```
 Caller ──► RingCentral ──(call forward)──► Bland.ai number
                                                │
                                     runs bland-pathway.json
                                     (your scripts as nodes)
                                                │
                              POST /bland/book  ▼
                                         this webhook (server.js)
                                                │
                                  ServiceTitan CRM Bookings API
                                                ▼
                                  Booking appears in ST "Call Booking"
                                  queue for staff to confirm → Job
```

## What's in here

| File | Purpose |
|------|---------|
| `bland-pathway.json` | Both PDFs encoded as a Bland conversational pathway: greeting → triage → septic add-on pitch → 3 vetting questions → fee-waiver close → contact/schedule capture → booking webhook. |
| `src/server.js` | Express webhook Bland calls to create the booking. |
| `src/servicetitan.js` | ServiceTitan OAuth + CRM Bookings client. |
| `src/bland-pathway-builder.js` | Uploads the pathway to Bland and attaches it to your inbound number. |
| `.env.example` | All credentials/IDs you need to fill in. |

## Setup

### 0. Install
```bash
npm install
cp .env.example .env   # then fill in .env
```

### 1. ServiceTitan
1. In the [ServiceTitan Developer Portal](https://developer.servicetitan.io), create an app and request the **CRM** scope.
2. Have a tenant admin connect the app to your tenant; that produces the **Client ID**, **Client Secret**, and **App Key**.
3. In ServiceTitan, create a **Booking Provider** (Settings → Integrations → Booking) and note its numeric ID.
4. Fill `ST_CLIENT_ID`, `ST_CLIENT_SECRET`, `ST_APP_KEY`, `ST_TENANT_ID`, `ST_BOOKING_PROVIDER_ID` in `.env`. Use the **integration (sandbox)** endpoints first to test.

Bookings land in the ServiceTitan **Call Booking** queue. Staff (or a Dispatch rule) convert each into a scheduled job — this is intentional, so a human confirms the exact time window and service before a truck is committed.

### 2. Deploy the webhook
Host `server.js` anywhere with a public HTTPS URL (Render, Railway, Fly, a VM, etc.):
```bash
npm start
```
Note the public URL, e.g. `https://emerald-agent.yourhost.com`.

### 3. Bland.ai
1. Buy/provision an inbound number in Bland and set `BLAND_INBOUND_NUMBER` + `BLAND_API_KEY` in `.env`.
2. In `bland-pathway.json`, set the `book` node's `url` to your deployed webhook (`https://.../bland/book`) and put your `WEBHOOK_SECRET` in its `x-emerald-secret` header.
3. Upload it:
   ```bash
   npm run deploy-pathway
   ```
   (Or import `bland-pathway.json` by hand in the Bland dashboard → Conversational Pathways, then attach it to the number. Same result.)
4. Place a test call to the Bland number and walk the septic flow end-to-end.

### 4. RingCentral
The simplest, most reliable path is **call forwarding** — no telephony code needed:
1. RingCentral Admin → **Phone System → Auto-Receptionist / IVR** (or the User/Queue that owns your main line).
2. Set call handling to **forward** incoming calls to your Bland inbound number, either always or after-hours/overflow while you pilot it.
3. Test by calling your published Emerald number; it should ring through to the agent.

If you'd rather keep RingCentral in the middle (record/whisper/route programmatically) instead of plain forwarding, that uses the RingCentral Voice/Telephony API and SIP — a bigger build; the forwarding approach above is what most shops run.

## What the agent collects

In order, per call: first & last name, callback phone, email, **how they heard about us** (saved as the ServiceTitan booking `source`), service address, and morning/afternoon preference. The agent then tells the caller a team member will be in touch to collect payment and confirm the service. **No payment information is collected on the call.**

## Payment — handled by a team member

The agent does not take any payment details. After capturing the booking, it tells the caller that a team member will follow up to collect payment information and confirm the service, and the booking note flags this for your office.

This is the simplest and safest setup: no card number, expiration, security code, or card type ever passes through the AI agent, the webhook, or your server, so none of it lands in call recordings, transcripts, or logs, and your stack stays out of PCI scope. As a safety net, `server.js` still strips any field that resembles card data before logging or forwarding (verified). Your team takes payment on follow-up through your normal PCI-compliant method and discloses any Amex surcharge at that point.

If you later want the agent to send a self-service tokenized payment link instead of a human follow-up, that can be added back — just ask.

## Where the call data goes

After the call, Bland POSTs the captured details to the live middleware at
`https://emerald-voice-middleware.onrender.com/bland/book`. The middleware (1) creates a
ServiceTitan booking and (2) emails a summary to the workorders inbox. If ServiceTitan is
unreachable, it still emails the lead so nothing is lost.

For the booking to reach ServiceTitan, the Bland booking node's `url` must be that Render URL
(now set in the pathway file) and the `x-emerald-secret` header must match the `WEBHOOK_SECRET`
configured on Render — otherwise the middleware rejects the request.

## Email notifications

Set these in the Render environment to send each booking to `workorders@emerald911.com`:
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `FROM_EMAIL`, `NOTIFY_EMAIL`. Leave
`SMTP_HOST` blank to disable email (bookings still flow to ServiceTitan). The email includes
name, phone, email, service, address, preferred time, referral source, any additional issues,
and the ServiceTitan booking number — never any payment/card data.

## Notes & limits
- Pricing in the scripts is estimation-only; the agent avoids quoting firm prices unless the caller asks, matching your price-list note.
- ServiceTitan and Bland both version their APIs and occasionally change required fields. Shapes here reflect early-2026 docs — verify against current docs before launch, and test in sandbox first.
- The pathway includes an **emergency** branch (flooding / sewage backup / no water) that hands off to a live team member; wire that node to a transfer or to your on-call line in the Bland dashboard.
