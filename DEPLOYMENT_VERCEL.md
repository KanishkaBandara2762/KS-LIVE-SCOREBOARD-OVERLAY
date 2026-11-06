# Deploying KS Live + Auction on Vercel (legacy)

> **This is not the current deployment path.** The project now deploys fully on
> **Netlify + MongoDB Atlas** — see [`DEPLOYMENT_OPTIONS.md`](./DEPLOYMENT_OPTIONS.md).
> The Vercel guide is kept only as a reference for frontend-on-Vercel setups and
> assumes you supply a separate always-on Node host for the API.

This legacy guide deploys the **frontend to Vercel** and the **API / Socket.IO
backend to a separate always-on Node host**, with **MongoDB Atlas** as the
database. Nothing is committed to git by these steps.

## Why not put the backend on Vercel too?

The auction module is server-authoritative and real-time:

- Socket.IO rooms broadcast bids to every connected team owner.
- Auction lots need a reliable server-side timer.
- The backend keeps a persistent MongoDB connection and recovers live auctions on restart.

Vercel Functions can serve WebSockets in public beta, but connections are capped by the function duration (300 seconds on Hobby), timers are not reliable after a response finishes, and in-memory rooms do not span function instances without Redis. For a live auction that is a risky combination. A small always-on Node service on Render is the reliable choice; Vercel hosts the React app.

If you only need a demo, the frontend and backend can both be tested locally, but production auctions should use the split below.

```
Browser
  │
  ├── https://your-app.vercel.app        React / Vite (static)
  │
  └── https://your-api.onrender.com      Express + Socket.IO
                 │
                 └── MongoDB Atlas (M0 free tier)
```

---

## Before you start — one-page checklist

You need three free accounts: **MongoDB Atlas**, **Render**, **Vercel**, plus a GitHub repository containing this code.

| Step | Where | What you do |
| --- | --- | --- |
| 1 | Atlas | Create M0 cluster, DB user, allow `0.0.0.0/0`, copy the `mongodb+srv://` string |
| 2 | Render | New Web Service from the repo, Root Directory `backend`, add env vars, copy the service URL |
| 3 | Vercel | Import the repo, Root Directory `frontend`, add `VITE_API_URL`, copy the app URL |
| 4 | Render | Set `FRONTEND_ORIGIN` + `FRONTEND_URL` to the Vercel URL and redeploy |
| 5 | Vercel | Register, create an auction, test two browsers bidding |

The four values you will move between services:

```
MONGODB_URI        Atlas  ->  Render
https://<render>   Render ->  Vercel  (VITE_API_URL)
https://<vercel>   Vercel ->  Render  (FRONTEND_ORIGIN + FRONTEND_URL)
```

---

## 1. Create the MongoDB Atlas database

1. Create a free account at <https://www.mongodb.com/cloud/atlas/register>.
2. Create a **free M0 cluster** (any nearby region).
3. Open **Database Access** → **Add New Database User**:
   - Authentication: password
   - Username: e.g. `kslive`
   - Password: generate a strong password and save it
   - Role: **Read and write to any database**
4. Open **Network Access** → **Add IP Address** → **Allow access from anywhere** (`0.0.0.0/0`). Render's outbound IPs are dynamic on the free plan.
5. Open **Database** → **Connect** → **Drivers** and copy the connection string. Replace `<password>` and add a database name:

```
mongodb+srv://kslive:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/ks-live?retryWrites=true&w=majority&appName=KSlive
```

Keep this string private. It goes into Render's environment variables, not into git.

---

## 2. Deploy the backend to Render

### Option A — Blueprint (uses `render.yaml`)

1. Push this repository to GitHub (do **not** commit `backend/.env`).
2. In Render: **New** → **Blueprint** → connect the repo.
3. Render reads `render.yaml` and asks for the values marked `sync: false`:
   - `MONGODB_URI`: the Atlas string from step 1
   - `FRONTEND_ORIGIN`: put `http://localhost:5173` for now; update it in step 4
   - `FRONTEND_URL`: same as above for now; update it in step 4
4. Deploy. The service URL will look like `https://ks-live-api.onrender.com`.

### Option B — Manual Web Service

1. Render: **New** → **Web Service** → connect the repo.
2. Settings:
   - **Root Directory**: `backend`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/health`
   - **Plan**: Free (for testing)
3. Add environment variables:

| Key | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `MONGODB_URI` | your Atlas connection string |
| `JWT_SECRET` | a long random string (Render can generate one) |
| `JWT_EXPIRES_IN` | `7d` |
| `FRONTEND_ORIGIN` | `http://localhost:5173` until step 4 |
| `FRONTEND_URL` | `http://localhost:5173` until step 4 |
| `AUCTION_REQUIRE_ENTITLEMENT` | `false` for the first test deployment |

4. Deploy and open `https://your-api.onrender.com/health`. You should get a health response with the database connected. If the first request is slow, the free Render instance is waking up.

> **Free plan note:** Render free services sleep after inactivity and wake on the next request. The first page load after a sleep can take 30–60 seconds. The auction socket reconnects automatically.
>
> **Scaling note:** The auction and scoreboard use in-memory Socket.IO rooms. Keep the Render service on a single instance. If you later scale to multiple instances, add the Socket.IO Redis adapter so bids reach sockets connected to other instances.

---

## 3. Deploy the frontend to Vercel

1. Create a Vercel account at <https://vercel.com/signup>.
2. **Add New** → **Project** → import the same GitHub repository.
3. Configure the project:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Add an environment variable for **Production**, **Preview**, and **Development**:

| Key | Value |
| --- | --- |
| `VITE_API_URL` | `https://your-api.onrender.com` |

Use the backend **origin only**: no trailing slash and no `/api` suffix. The frontend adds the route paths itself.

5. Deploy. Your app URL will look like `https://ks-live.vercel.app`.

> `VITE_API_URL` is baked in at build time. If you change the backend URL, change the variable and redeploy the frontend.

The repository already contains `frontend/vercel.json`, which rewrites client-side routes (including `/auctions/...` and `/auction/display/...`) to `index.html`.

> If you import the repository **root** instead of `frontend`, the root `vercel.json` builds the frontend with `npm --prefix frontend run build` and serves `frontend/dist`. Both layouts work, but `frontend` as the Root Directory is the simpler choice.

---

## 4. Connect the two URLs

1. Copy the Vercel URL, e.g. `https://ks-live.vercel.app` (no trailing slash).
2. In Render → your service → **Environment**, update:
   - `FRONTEND_ORIGIN=https://ks-live.vercel.app`
   - `FRONTEND_URL=https://ks-live.vercel.app`
3. Save and redeploy the Render service.

`FRONTEND_ORIGIN` allows browser requests. `FRONTEND_URL` is used to build team-owner invite links such as:

```
https://ks-live.vercel.app/auction/join/<token>
```

If invite links point at `localhost:5173`, this variable is still wrong.

---

## 5. Test the auction end to end

1. Open the Vercel URL and register/login.
2. Dashboard → **Auctions** → **New Auction**.
3. Add at least two teams and two players (or import a tournament squad).
4. Start the auction, then open **Control room**.
5. In **Setup → Teams**, click **Invite owner** and copy the link.
6. Open the invite link in a private/incognito window, register/login as the owner, and accept.
7. Back in the control room, **Next lot**, then bid from two different browsers.
8. Check the countdown, bid feed, purse updates, and **Hammer** result.
9. For a public screen, set the auction visibility to **Public** in Setup → Rules, then open the **Display** link. It is safe for OBS/projector and does not require login.

### What to verify

- A second private auction can be created (the `publicSlug` index is per-slug, not global).
- The same bid retry does not create duplicate rows (idempotency key).
- The leading team cannot outbid itself.
- A bid timed near the end extends the timer.
- The winning team's purse and squad update after the hammer.
- Restarting the Render service recovers live lots (the server closes expired lots on boot).
- A second invite clicked twice still succeeds (idempotent), and one account cannot own two teams in the same auction.

---

## 6. Turn on the premium entitlement later

For the first deployment `AUCTION_REQUIRE_ENTITLEMENT=false` keeps the module open for testing. When you are ready to sell it:

1. Set `AUCTION_REQUIRE_ENTITLEMENT=true` on Render and redeploy.
2. Make your account an admin. The safest way is to open MongoDB Atlas → **Browse Collections** → `users` and set `role: "admin"` on your user. Do not run the sample `backend/createAdmin.js` on production unless you edit its hardcoded email and password first.
3. Grant access with the admin API:

```http
POST /api/admin/auction-entitlements
Authorization: Bearer <admin JWT>
Content-Type: application/json

{
  "userId": "<user id>",
  "days": 30,
  "maxActiveAuctions": 1,
  "maxTeamsPerAuction": 20
}
```

You can inspect entitlements with `GET /api/admin/auction-entitlements` and extend or revoke them with `PATCH /api/admin/auction-entitlements/:id`.

Team owners do **not** need a paid entitlements; only the auctioneer creating/running the auction does.

---

## Troubleshooting

### The frontend says "Cannot reach server"

- `VITE_API_URL` is missing or points to the wrong Render URL.
- Redeploy the Vercel project after changing the variable.
- Open `https://your-api.onrender.com/health` directly. If it is asleep, wait for it to wake.

### CORS errors in the browser

- In development, any origin is allowed.
- In production, the backend allows `*.vercel.app`, `kslivebroadcasting.com`, `*.vercel.app` previews, local network IPs, and ngrok. If you use a custom domain, set `FRONTEND_ORIGIN` to it and add the domain to `getAllowedOrigins()` in `backend/server.js`.

### Socket.IO keeps reconnecting

- Make sure `VITE_API_URL` uses `https://`, not `http://`.
- The Render free instance may be waking up.
- Check the browser console for the socket URL; it should be `https://your-api.onrender.com` with the default `/socket.io` path.

### "AUCTION_ENTITLEMENT_REQUIRED"

- `AUCTION_REQUIRE_ENTITLEMENT=true` and the account has no active entitlement.
- Grant one via the admin endpoint or set the variable to `false` for testing.

### An invite says "You already own ... in this auction"

- Each account can manage **one team per auction**. Use a separate account for each team owner, or have the auctioneer manage the extra teams.
- This is enforced by a unique `(auctionId, ownerUserId)` index, so it cannot be bypassed by two simultaneous clicks.

### 503 "Database not connected"

- Check `MONGODB_URI` in Render. Verify the Atlas user password and that the IP allow-list includes `0.0.0.0/0`.
- Check Render logs for the MongoDB connection error.

### Uploaded logos disappear after a deploy

Render's filesystem is ephemeral. The auction module accepts logo URLs and does not depend on local uploads. If you need persistent logo uploads for the scoreboard module, attach a Render disk or move uploads to an object store.

---

## Using an existing test database

If your earlier database is already running (e.g. local MongoDB, a Docker `mongod`, or an Atlas cluster), edit `backend/.env`:

```diff
- MONGODB_URI=mongodb://localhost:27017/ks-live
+ MONGODB_URI=<your-connection-string-here>
```

For a **quick stand-alone test without installing MongoDB locally**, the smoke suite already downloaded the MongoDB 8.2.6 binary (~780MB) into the smoke temp directory — reuse it with `MONGOMS_SYSTEM_BINARY`:

```powershell
$env:MONGOMS_SYSTEM_BINARY = Join-Path $env:TEMP 'opencode\auction-smoke\mongod.exe'
$env:MONGODB_URI = 'mongodb://127.0.0.1:27018/ks-live'
```

Then start the backend (`cd backend; npm run dev`) and open <http://localhost:5173/auctions>.

## Commands for local verification (optional)

```bash
# Backend (in D:\Projects\Score Board\KS-LIVE-SCOREBOARD-OVERLAY\backend)
npm install
npm run dev               # nodemon → http://localhost:3001

# Frontend (new terminal, same repo root)
npm --prefix frontend run dev   # Vite → http://localhost:5173
```

Open <http://localhost:5173> and the link you just added appears on both login and register pages: **🔨 Explore Auctions**. Click it, register, create an auction with two teams, bid from two browsers, and hammer.
