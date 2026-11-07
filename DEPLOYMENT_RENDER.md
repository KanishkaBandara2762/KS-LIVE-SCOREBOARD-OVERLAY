# Deploy KS Live on Render (secondary target)

Netlify remains the primary deployment at <https://kslivescore.netlify.app>.
This guide adds a second, independent deployment on Render. Nothing in this
setup changes the Netlify site.

**Current live Render deployment:**

| Service | URL |
| --- | --- |
| Frontend | <https://kslivescore-web.onrender.com> |
| API | <https://kslivescore-api.onrender.com> |
| Health | <https://kslivescore-api.onrender.com/health> |

Workspace: **Kanishka Bandara**. Both services use the free plan and
auto-deploy from `main`.

```
Browser
  │
  ├── https://kslivescore-web.onrender.com     → React static site
  └── https://kslivescore-api.onrender.com     → Express + Socket.IO API
                                                    │
                                                    └── MongoDB Atlas (free M0)
```

## Why two Render services

Netlify Functions cannot hold a persistent WebSocket. Render runs an always-on
Node process, so this deployment keeps native Socket.IO for the scoreboard and
auction, while both deployments share the same Atlas database.

## One-time setup

The services below are already live. Follow these steps only to recreate the
deployment in another workspace.

1. Add a payment method to the Render workspace
   (**Account Settings → Billing → Payment Method**). Render requires one on
   file before it will create any service, including free ones. Free services
   are not charged.
2. In the Render Dashboard choose **New → Blueprint**.
3. Connect the GitHub repo
   `KanishkaBandara2762/KS-LIVE-SCOREBOARD-OVERLAY`.
4. Render reads `render.yaml` and creates:
   - `kslivescore-api` — free web service, root `backend`
   - `kslivescore-web` — free static site, root `frontend`
5. When prompted, enter:
   - `MONGODB_URI` — the Atlas connection string for `ks-live-prod`
   - `JWT_SECRET` — the same secret used by Netlify
6. Apply the Blueprint. The first deploy takes a few minutes.

## Resulting URLs

| Service | URL |
| --- | --- |
| Frontend | `https://kslivescore-web.onrender.com` |
| API | `https://kslivescore-api.onrender.com` |
| Health | `https://kslivescore-api.onrender.com/health` |

The frontend build receives `VITE_API_URL=https://kslivescore-api.onrender.com`
automatically through the `fromService` reference in `render.yaml`.

## Automatic deployment

A push to `main` deploys through `.github/workflows/deploy.yml` (GitHub
Actions), which triggers both Render services with the Render API and waits for
them to reach `live`. The workflow requires the `RENDER_API_KEY` repository
secret.

Render's dashboard "Auto-Deploy" toggle has no effect on these services because
the repository was added by URL instead of through the Render GitHub App. Use the
workflow (or **Manual Deploy**) instead.

## Behaviour differences vs Netlify

| Concern | Netlify | Render |
| --- | --- | --- |
| API hosting | Netlify Function | Always-on Node web service |
| Live updates | REST polling every 3 s | Native Socket.IO |
| Cold start | Function cold start | Free service spins down after 15 min idle, ~1 min to wake |
| Disk | `/tmp` only | Ephemeral |

## Notes

- The Render free web service spins down after 15 minutes without traffic. The
  first request afterwards takes about a minute to wake it.
- Uploaded logos write to the ephemeral filesystem and are lost on redeploy.
  Use external `https://` image URLs.
- `MONGODB_URI` and `JWT_SECRET` are stored only in Render's environment
  settings, never in Git.
- To redeploy, push to `main` (the GitHub Actions workflow) or click
  **Manual Deploy** in the Render Dashboard.
