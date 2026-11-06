# Deploy KS Live on Netlify + MongoDB Atlas

This is the complete deployment guide for the **Netlify-only** setup:

```
Browser
  │
  ├── https://<site>.netlify.app/*        → static React app (frontend/dist)
  └── https://<site>.netlify.app/api/*    → Netlify Function → Express API
                                                │
                                                └── MongoDB Atlas (M0)
```

No Render, no Vercel, no separate backend host.

**Current live deployment:**
<https://elaborate-lamington-04f8db.netlify.app>

The production site uses the `ks-live-prod` database on the same free Atlas
cluster, kept separate from local development (`ks-live`). Both databases are
on the free M0 tier.

---

## How the Netlify-only backend works

Netlify Functions are short-lived HTTP handlers. They cannot hold a Socket.IO
connection and they do not keep `setTimeout` timers alive between requests.
This project therefore adapts automatically:

| Concern | Netlify solution |
| --- | --- |
| API hosting | `netlify/functions/api.js` wraps the Express app from `backend/app.js` |
| Same-origin requests | Netlify redirects `/api/*` to the function; no CORS, no `VITE_API_URL` |
| Live updates | React polls the REST API instead of Socket.IO (`VITE_REALTIME_MODE=polling` by default in production). Auctions poll `GET /api/auctions/:id`; scoreboard, public match and OBS overlay pages poll their public endpoints every 3 seconds (`VITE_LIVE_POLL_MS`). |
| Auction deadlines | `auctionEngine.settleExpiredLot()` closes an expired lot on the next request instead of relying on a background timer |
| Database | MongoDB Atlas M0, connected lazily and cached between warm function invocations |

Local development is unchanged: `npm run backend-dev` still runs Express +
Socket.IO on port 3001 with real-time sockets.

---

## Before you start — checklist

| Account | Purpose | Cost |
| --- | --- | --- |
| GitHub | Netlify deploys from a repo | Free |
| MongoDB Atlas | Database (M0 cluster) | Free |
| Netlify | Static site + Functions | Free |

You also need the repository pushed to GitHub.

---

## Step 1 — Create the MongoDB Atlas database

Do this first so you have the connection string ready.

1. Sign up at <https://www.mongodb.com/cloud/atlas/register>.
2. **Create** → **M0 / Free**.
3. Provider/region: **AWS → Oregon** (or the region closest to you).
4. Cluster name: `kslive` → **Create Deployment**.
5. **Database Access** → **Add New Database User**:
   - Username: `kslive`
   - Password: **Autogenerate** → copy it somewhere safe
   - Privileges: **Read and write to any database**
   - **Add User**
6. **Network Access** → **Add IP Address** → **Allow Access from Anywhere**
   (`0.0.0.0/0`) → **Confirm**.
   Netlify Functions use dynamic outbound IPs, so an allow-list of specific
   addresses will not work.
7. **Database** → **Connect** → **Drivers** → **Node.js** → copy the string.
8. Edit the string:
   - replace `<db_password>` with the real password
   - insert the database name `/ks-live` before the `?`

Final form:

```
mongodb+srv://kslive:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/ks-live?retryWrites=true&w=majority&appName=kslive
```

> Use only letters and numbers in the password, or URL-encode special
> characters (`@ : / ? # %`). A raw `@` or `/` will break the URI.

Keep this string private. It goes into Netlify environment variables only.

### 1b. Use a separate production database (recommended)

Local development and production can share one M0 cluster while using different
databases:

| Environment | Database in the URI | Purpose |
| --- | --- | --- |
| Local | `/ks-live` | Development; can be seeded with sample data |
| Production | `/ks-live-prod` | Real users; starts clean |

On Netlify set `MONGODB_URI` with `/ks-live-prod`. Your local `backend/.env`
keeps `/ks-live`. Seeding scripts are safe to run locally; never run the
destructive `seedDatabase.js` against the production database.

Seed the production subscription plans once (read-only to users):

```powershell
cd backend
$env:MONGODB_URI = "mongodb+srv://.../ks-live-prod?retryWrites=true&w=majority"
node seedPlans.js
```

Production starts with **no users**, so create your account through
`/register` after the first deploy.

---

## Step 2 — Push the code to GitHub

Netlify builds from Git.

> ⚠️ The working tree currently contains other modifications unrelated to the
> auction/deployment work. Review `git status` before `git add -A`.

```powershell
cd "D:\Projects\Score Board\KS-LIVE-SCOREBOARD-OVERLAY"
git status
git add -A
git commit -m "feat(auction): Netlify Functions backend + polling client"
git push origin main
```

---

## Step 3 — Create the Netlify site

1. Go to <https://app.netlify.com> → **Add new site** → **Import an existing
   project** → **GitHub** → select the repository.
2. **Leave the Base directory empty.** The repository root contains
   `netlify.toml`, `netlify/functions/`, and `backend/`.
3. Netlify reads `netlify.toml`, which already sets:

| Setting | Value |
| --- | --- |
| Build command | `npm install && npm install --prefix backend && cd frontend && npm install && npm run build` |
| Publish directory | `frontend/dist` |
| Functions directory | `netlify/functions` |
| Node version | 20 |

Do not override these in the UI unless you know why.

4. Click **Deploy site**. The first deploy may fail until the environment
   variables from Step 4 are added — that is expected.

---

## Step 4 — Add environment variables

Netlify → **Site configuration** → **Environment variables** → **Add a variable**.

| Key | Value | Required |
| --- | --- | --- |
| `MONGODB_URI` | `mongodb+srv://kslive:...@cluster0.xxxxx.mongodb.net/ks-live-prod?retryWrites=true&w=majority` | ✅ |
| `JWT_SECRET` | long random string (e.g. 64 random hex characters) | ✅ |
| `NODE_ENV` | `production` | ✅ |
| `FRONTEND_URL` | `https://<your-site>.netlify.app` | ✅ (invite links) |
| `FRONTEND_ORIGIN` | `https://<your-site>.netlify.app` | recommended (CORS) |
| `AUCTION_REQUIRE_ENTITLEMENT` | `false` | ✅ for a free/open launch |
| `VITE_AUCTION_POLL_MS` | `3000` | optional (auction polling interval) |
| `VITE_LIVE_POLL_MS` | `3000` | optional (scoreboard/overlay polling interval) |
| `VITE_REALTIME_MODE` | `polling` | optional (default in production) |

The free Netlify plan does not support per-scope environment variables, so use
the default scopes. Values are still encrypted at rest by Netlify.

### Do NOT set `VITE_API_URL`

In production the API is same-origin (`/api/*`). Setting `VITE_API_URL` would
point the browser away from Netlify and reintroduce CORS. Only set it if you
deliberately host the API on another domain.

> `VITE_*` values are compiled into the JavaScript bundle. After changing one,
> redeploy with **Deploys → Trigger deploy → Clear cache and deploy site**.

### Generate a JWT secret (PowerShell)

```powershell
-join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Minimum 0 -Maximum 16) })
```

---

## Step 5 — Deploy and verify

After adding the variables: **Deploys → Trigger deploy → Deploy site**.

### 5.1 API health

Open:

```
https://<your-site>.netlify.app/health
```

Expected: HTTP `200` with `"database": "MongoDB ✅ Connected"`.

Also works:

```
https://<your-site>.netlify.app/api/health
https://<your-site>.netlify.app/health/ready
```

`/health` returns 200 even before the database is ready (status `degraded`);
`/health/ready` returns `503` until Atlas is connected. Both are served by the
Netlify Function through `netlify.toml` redirects.

### 5.2 Database diagnostics

If `/health` says `MongoDB ❌ Not connected`:

- Recheck `MONGODB_URI` — password, `/ks-live` database name, no stray spaces.
- Atlas → **Network Access** must allow `0.0.0.0/0`.
- Atlas → **Database Access** user must have read/write privileges.
- Confirm the cluster is not paused.

### 5.3 Frontend

Open the site root. The React app loads from `frontend/dist`.

1. Click **🔨 Explore Auctions** (login/register pages) or go to `/auctions`.
2. Register an account.
3. **New Auction** → add 2 teams and 2 players.
4. **Start auction** → open the next lot.
5. Open the site in two browsers, join as team owners, and bid.
6. Watch the timer, bid feed, purse updates, and the hammer.

Team-owner invites are created from **Setup → Teams → Invite owner**. The
generated link uses `FRONTEND_URL`, so it should look like:

```
https://<your-site>.netlify.app/auction/join/<token>
```

If it says `localhost`, `FRONTEND_URL` is wrong — fix it and redeploy.

---

## Step 6 — Optional: make yourself an admin

Admin access is only needed to manage auction entitlements when you start
selling the add-on.

1. Atlas → **Browse Collections** → `ks-live-prod` → `users` (use `ks-live` for local).
2. Find your user and edit `role` to `"admin"` → **Update**.
3. You can then call `POST /api/admin/auction-entitlements` with your JWT.

For the first launch, leave `AUCTION_REQUIRE_ENTITLEMENT=false` so everyone can
create auctions. Later set it to `true` and grant entitlements per account.

---

## What to expect from real-time behavior

- **Bid latency:** up to ~3 seconds (the polling interval), plus normal network
  time. Set `VITE_AUCTION_POLL_MS=2000` for a snappier feed at the cost of more
  function invocations.
- **Timer:** the countdown is computed from `serverTime` + `timerEndsAt`, so it
  stays smooth between polls.
- **Lot close:** when the timer expires, the lot is closed by the next request
  (snapshot or bid attempt). If nobody has the page open, it closes as soon as
  someone next loads it. The result is identical to a background-timer close.
- **Function timeout:** Netlify Functions have a short execution limit
  (about 10 seconds on the free plan). Every API action here is a single fast
  request, so this is not an issue. Do not add long-running work to the API.
- **Cold starts:** the first request after inactivity may take a few seconds
  while the function boots and connects to Atlas.

## Known Netlify limitations

| Limitation | Impact | Workaround |
| --- | --- | --- |
| No persistent WebSockets | Socket.IO connections cannot stay open | Polling is enabled automatically in production |
| No background timers | A setTimeout does not survive the response | Lazy lot close on the next request |
| Ephemeral function disk | Function writes go to `/tmp`; the returned `/uploads/...` URL does not resolve | Use external image URLs (`https://...`) for team/match logos, or add Netlify Blobs / S3 storage |
| Stateless instances | In-memory rate-limit counters are per instance | Fine for this app; use a shared store if you need strict global limits |

The scoring/overlay part of the app still works over HTTP. In production the
scoreboard, public match page and OBS overlay poll their REST endpoints every
3 seconds (`VITE_LIVE_POLL_MS`), and the auction polls every 3 seconds
(`VITE_AUCTION_POLL_MS`). For mission-critical low-latency overlays, run the
backend on an always-on Node host and set `VITE_REALTIME_MODE=socket` +
`VITE_API_URL`; the auction works in both modes.

---

## Local development (unchanged)

```powershell
# Terminal 1 — Express + Socket.IO on http://localhost:3001
cd backend
npm install
npm run dev

# Terminal 2 — Vite on http://localhost:5173
cd frontend
npm install
npm run dev
```

Local development defaults to Socket.IO. To test the polling path locally:

```powershell
# frontend/.env.local
VITE_REALTIME_MODE=polling
```

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Netlify build fails at `npm install --prefix backend` | Check the deploy log. Confirm `backend/package.json` exists and Node 20 is used. |
| `Cannot reach the server` in the app | Do not set `VITE_API_URL`; verify `/health` on the Netlify domain. |
| `503` / `DB_UNAVAILABLE` | Wrong `MONGODB_URI`, unencoded password characters, or Atlas network access missing `0.0.0.0/0`. |
| `/health` says degraded | Atlas connection failed — check the Function log in Netlify (**Functions → api → Logs**). |
| Invite links point to localhost | Set `FRONTEND_URL` to the Netlify URL and redeploy. |
| Build ignored `netlify.toml` | A Base directory was set in the UI. Clear it to use the repository root config. |
| Bids feel slow | Lower `VITE_AUCTION_POLL_MS` (e.g. `2000`) and redeploy. |
| Timer expires but the lot stays open | It closes on the next request; refresh or wait for the poll. Check the Function log for `[AUCTION LAZY CLOSE]`. |
| Rate limit `Too many requests` | The API limit is 300 requests/min in production. Reduce polling frequency or run the backend on an always-on host. |

---

## Cost

| Service | Plan | Cost |
| --- | --- | --- |
| Netlify | Free / Starter | Free (Functions included with limits) |
| MongoDB Atlas | M0 | Free |
| GitHub | Free | Free |

Netlify's free tier includes 125,000 function invocations per month. With one
auction room polling every 3 seconds, expect roughly 20 requests per minute per
open page (about 1,200 per hour). A handful of simultaneous rooms fits
comfortably; increase the polling interval if you expect many viewers.

---

## Files involved in this deployment

| File | Purpose |
| --- | --- |
| `netlify.toml` | Build, publish, Functions directory, `/api/*` redirects, SPA fallback |
| `netlify/functions/api.js` | Netlify Function entry point; connects to Atlas and forwards to Express |
| `backend/app.js` | Express app factory shared by `server.js` and the Function |
| `backend/config/db.js` | Cached serverless connection + long-running retry loop |
| `backend/services/auctionEngine.js` | Bidding engine, lazy lot closing, recovery |
| `frontend/src/components/auction/auctionShared.jsx` | Socket.IO *or* polling live hook |
| `frontend/src/api.js` | Same-origin API base URL in production |
