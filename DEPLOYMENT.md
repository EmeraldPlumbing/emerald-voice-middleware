# Emerald Plumbing — Voice Agent Deployment

**Status:** Ready to deploy  
**Target:** Render.com (free tier)  
**Architecture:** Bland.ai inbound call → ServiceTitan booking webhook

---

## Prerequisites

You need three values. Get them now:

### 1. Bland.ai Inbound Number
- Log in to https://app.bland.ai
- Go to **Phone Numbers** or **Integrations**
- Create or select an inbound number (if not done yet)
- Example format: `+12025550123`
- **Set:** `BLAND_INBOUND_NUMBER=+1234567890` in `.env`

### 2. ServiceTitan Booking Provider
- Log in to ServiceTitan
- Go to **Settings → Integrations → Booking** (or search "Booking Provider")
- Create a new booking provider called "Emerald Voice Agent" or similar
- Copy its numeric ID (e.g., `12345`)
- **Set:** `ST_BOOKING_PROVIDER_ID=12345` in `.env`

### 3. WEBHOOK_SECRET
- Generate a strong random string (32+ characters)
- Tools: `openssl rand -hex 32` or use https://www.random.org/strings/
- Example: `aB3cD4eF5gH6iJ7kL8mN9oPqRsT0uVwXyZ1aBcD2fG3hI4jK5lM`
- **Set:** `WEBHOOK_SECRET=...` in `.env`

---

## Deployment Steps

### Step 1: Finalize `.env`

Edit `/tasklet/agent/home/emerald-voice-middleware/.env` and replace the three `TODO_REPLACE_*` placeholders with your real values:

```bash
WEBHOOK_SECRET=aB3cD4eF5gH6iJ7kL8mN9oPqRsT0uVwXyZ1aBcD2fG3hI4jK5lM
BLAND_INBOUND_NUMBER=+12025550123
ST_BOOKING_PROVIDER_ID=12345
```

### Step 2: Push to GitHub

The middleware code lives in `/tasklet/agent/home/emerald-voice-middleware/`. Commit and push to your GitHub repo:

```bash
cd emerald-voice-middleware
git init
git remote add origin https://github.com/YourRepo/emerald-voice-middleware.git
git add .
git commit -m "Initial voice agent webhook"
git push -u origin main
```

**What to push:**
- `src/server.js`
- `src/servicetitan.js`
- `bland-pathway-builder.js`
- `bland-pathway.json`
- `package.json`
- `.env` (if using Render's Secret Files feature) OR just the `.env.example` (you'll set env vars in Render dashboard)

**What to skip:**
- `node_modules/` (Render installs deps automatically)
- `.env` (use Render dashboard instead, below)

### Step 3: Deploy to Render.com

1. **Log in** to https://render.com (free tier)
2. **Create New → Web Service**
3. **Connect your GitHub repo** where you pushed the middleware
4. **Configure:**
   - **Name:** `emerald-voice-agent`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
5. **Environment Variables** (Render dashboard):
   - Add each variable from your `.env`:
     - `WEBHOOK_SECRET=aB3cD4eF5gH6iJ7kL8mN9oPqRsT0uVwXyZ1aBcD2fG3hI4jK5lM`
     - `BLAND_INBOUND_NUMBER=+12025550123`
     - `ST_CLIENT_ID=cid.d7wpwh65yoa3qc6nmik6noems`
     - `ST_CLIENT_SECRET=cs4.5unilb7exitcwitxphbf3m6fkh4cjz7ftenwci66ttj0ljijv1`
     - `ST_APP_KEY=ak1.fnbk74l7r38oi0w7l934vo8ok`
     - `ST_TENANT_ID=909240878`
     - `ST_BOOKING_PROVIDER_ID=12345` (your Booking Provider ID)
     - `ST_AUTH_URL=https://auth.servicetitan.io/connect/token`
     - `ST_API_BASE=https://api.servicetitan.io`
     - `PORT=8080`

6. **Deploy** — Render builds and starts the service
7. **Copy the public URL** from the Render dashboard (e.g., `https://emerald-voice-agent.onrender.com`)

---

## Step 4: Configure Bland.ai Pathway

Once your webhook is live on Render, attach the conversational pathway to your Bland inbound number:

### Option A: Auto-Deploy (recommended)
```bash
cd emerald-voice-middleware
npm run deploy-pathway
```

This uploads `bland-pathway.json` to Bland and attaches it to your `BLAND_INBOUND_NUMBER`.

### Option B: Manual (via Bland dashboard)
1. Go to https://app.bland.ai → **Conversational Pathways**
2. **Import** → choose `bland-pathway.json`
3. Edit the pathway and find the **Webhook** node (near the end, labeled `"send_webhook"` or `"booking"`)
4. **URL:** `https://emerald-voice-agent.onrender.com/bland/book` (replace with your Render URL)
5. **Header:** `x-emerald-secret` = your `WEBHOOK_SECRET` value
6. **Save & Attach** this pathway to your inbound number

---

## Step 5: Test the Call Flow

1. **Call your Bland inbound number** from any phone
2. The AI (Emma) answers with the greeting
3. Walk through the conversation:
   - Tell her you need septic pumping
   - Answer the 3 vetting questions (location, accessibility, tank size)
   - Provide your contact info + address
4. At the end, the pathway sends a webhook to your Render server
5. The server creates a booking in ServiceTitan
6. **Verify:** Log into ServiceTitan → **Call Booking** queue → your new booking should appear

---

## Monitoring & Logs

### Check Server Logs
- Render dashboard → **Logs** tab — shows real-time console output
- Errors appear here if the webhook fails

### Test the Health Endpoint
```bash
curl https://emerald-voice-agent.onrender.com/health
# Returns: {"ok": true}
```

### Debug a Booking
If a booking fails, check:
1. **Webhook authentication:** Does the header `x-emerald-secret` match your `WEBHOOK_SECRET`?
2. **ServiceTitan credentials:** Are `ST_CLIENT_ID`, `ST_CLIENT_SECRET`, `ST_TENANT_ID`, `ST_APP_KEY` correct?
3. **Booking Provider ID:** Is `ST_BOOKING_PROVIDER_ID` set and does it exist in ServiceTitan?

---

## Next: RingCentral Integration

Once this webhook is confirmed working, set up call forwarding in RingCentral:

1. Log in to RingCentral admin
2. **Phone System → Auto-Receptionist / IVR** (or the main queue/user)
3. **Call Handling:** Set to **Forward** to your Bland inbound number
4. Test: Call your Emerald main number → should ring through to the AI

---

## Architecture Summary

```
Caller ──► RingCentral Main #
              │
         (call forward)
              ▼
         Bland.ai Inbound # (Emma)
              │
        (run bland-pathway.json)
              │
      POST /bland/book
              ▼
    Render.com Webhook Server
       (server.js on port 8080)
              │
        ServiceTitan OAuth
        (get access token)
              │
    POST /crm/v2/tenant/.../booking-provider/{id}/bookings
              ▼
    ServiceTitan Call Booking Queue
         (staff confirms → Job)
```

---

## Support

- **Bland.ai Docs:** https://docs.bland.ai
- **ServiceTitan API:** https://developer.servicetitan.io
- **Render Docs:** https://render.com/docs
