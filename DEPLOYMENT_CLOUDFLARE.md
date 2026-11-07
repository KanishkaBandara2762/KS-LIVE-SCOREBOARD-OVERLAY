# Deploy KS Live on Cloudflare (custom domain)

The public site now runs on **Cloudflare Pages** at
<https://www.kslivebroadcasting.com>, with the API on Render.

```
Browser
  └── https://www.kslivebroadcasting.com   → Cloudflare Pages (React build)
                                                 │ VITE_API_URL + Socket.IO
                                                 ▼
                                     https://kslivescore-api.onrender.com
                                                 │
                                                 └── MongoDB Atlas (ks-live-prod)
```

| Piece | Where | URL |
| --- | --- | --- |
| Frontend | Cloudflare Pages project `kslivescore` | <https://www.kslivebroadcasting.com> |
| Pages default host | Cloudflare Pages | <https://kslivescore.pages.dev> |
| API + Socket.IO | Render `kslivescore-api` | <https://kslivescore-api.onrender.com> |
| Database | MongoDB Atlas `ks-live-prod` | shared with Netlify and Render |

Netlify (<https://kslivescore.netlify.app>) and the Render frontend
(<https://kslivescore-web.onrender.com>) are unchanged and still live.

## Cloudflare configuration in place

| Setting | Value |
| --- | --- |
| Account ID | `054c9fa38f3c6052251740df1cb83199` |
| Zone ID | `2f1f1d8b2dc524a2b6677fe932a644b0` |
| Pages project | `kslivescore` |
| Custom domain | `www.kslivebroadcasting.com` (status: active, certificate: active) |
| DNS | proxied CNAME `www` → `kslivescore.pages.dev` |
| Apex | 301 redirect `kslivebroadcasting.com/*` → `https://www.kslivebroadcasting.com/*` |
| SSL mode | Full |
| Always Use HTTPS | On |
| SPA routing | `_redirects` → `/* /index.html 200` |

The Render API allows `*.kslivebroadcasting.com` origins, so CORS needs no
further changes. `FRONTEND_URL` and `FRONTEND_ORIGIN` on the Render API point at
`https://www.kslivebroadcasting.com`.

## Redeploying the frontend

Pages is deployed by direct upload (46 files, ~20 s). Wrangler authenticates
with the Cloudflare credentials from the environment; nothing is committed.

```powershell
cd frontend
$env:VITE_API_URL       = 'https://kslivescore-api.onrender.com'
$env:VITE_REALTIME_MODE = 'socket'
$env:VITE_AUCTION_POLL_MS = '3000'
$env:VITE_LIVE_POLL_MS    = '30000'
npm run build

# Cloudflare Pages needs an explicit SPA fallback; it is not part of the Vite build.
'/* /index.html 200' | Out-File -FilePath dist\_redirects -Encoding ascii -NoNewline

$env:CLOUDFLARE_EMAIL      = '<cloudflare account email>'
$env:CLOUDFLARE_API_KEY    = '<global api key>'
$env:CLOUDFLARE_ACCOUNT_ID = '054c9fa38f3c6052251740df1cb83199'
npx wrangler@3 pages deploy dist --project-name kslivescore --branch main
```

Every `--branch main` upload becomes the production deployment and is served at
both `kslivescore.pages.dev` and `www.kslivebroadcasting.com`.

## Notes

- Do **not** add `_redirects` to `frontend/public/`. Netlify processes that file
  before `netlify.toml`, which would shadow the `/api/*` → Function redirects.
  Write it into `frontend/dist` only for the Pages upload.
- Pages only hosts static files. Express, Socket.IO and Mongoose run on Render.
- The Render free web service sleeps after 15 minutes idle; the first request
  afterwards can take about a minute.
- Cloudflare credentials were provided in chat and should be rotated once setup
  is finished.
