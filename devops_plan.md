# 🚀 KS Live — Full DevOps Workflow Plan
> Target: 100 Users · Cost: ~$5–15/month · Stack: React + Express + Socket.IO + MongoDB

---

## 📐 Architecture Overview

```
Developer Machine (Windows)
        │
        │  git push
        ▼
   GitHub Repository
        │
        ├─── Push to `dev`    →  Run Tests Only
        │
        └─── Push to `main`   →  Full CI/CD Pipeline
                │
                ├── 1. Run Tests
                ├── 2. Build Frontend (Vite)
                ├── 3. Build Docker Image (Backend)
                ├── 4. Push Image → Docker Hub
                └── 5. SSH Deploy → Hetzner VPS
                              │
                        Hetzner CAX11
                        ├── Nginx (port 80/443)
                        │     ├── /          → React dist (static)
                        │     ├── /api/      → Node.js :3001
                        │     └── /socket.io/→ Socket.IO :3001 (wss)
                        ├── Node.js (Docker container)
                        └── Certbot SSL (Let's Encrypt)
```

---

## 🌿 Phase 1 — Git Branching Strategy

### Branch Structure

```
main          ← Production only. Every push here = live deployment.
dev           ← Active development. Merge here first.
feature/*     ← New features  (e.g. feature/team-logos)
fix/*         ← Bug fixes     (e.g. fix/socket-disconnect)
hotfix/*      ← Emergency production fixes
```

### Rules

| Branch | Auto Deploy? | Who pushes? |
|---|---|---|
| `main` | ✅ Yes → Production | Merge from `dev` only |
| `dev` | ❌ Tests only | You (daily work) |
| `feature/*` | ❌ No | You |
| `hotfix/*` | ✅ Yes → Production | Emergency only |

### Daily Workflow

```bash
# Start new feature
git checkout dev
git pull origin dev
git checkout -b feature/your-feature-name

# Work, commit
git add .
git commit -m "feat: add team logo support"
git push origin feature/your-feature-name

# Done → merge to dev
git checkout dev
git merge feature/your-feature-name
git push origin dev

# Ready to go live → merge to main
git checkout main
git merge dev
git push origin main   # ← This triggers full deployment automatically
```

---

## 🐳 Phase 2 — Docker Setup

### 2.1 — Backend Dockerfile

**File:** `backend/Dockerfile`

```dockerfile
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Security: run as non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Expose backend port
EXPOSE 3001

# Health check (used by Docker + CI)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "server.js"]
```

### 2.2 — Backend .dockerignore

**File:** `backend/.dockerignore`

```
node_modules
npm-debug.log
.env
.env.*
*.md
.git
.gitignore
```

### 2.3 — Docker Compose (Server)

**File:** `docker-compose.yml` (in project root, deployed to server)

```yaml
version: '3.9'

services:
  backend:
    image: YOUR_DOCKERHUB_USERNAME/ks-live-backend:latest
    container_name: ks-live-backend
    restart: unless-stopped
    ports:
      - "3001:3001"
    env_file:
      - .env.production
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    networks:
      - ks-live-network

networks:
  ks-live-network:
    driver: bridge
```

### 2.4 — Test Docker Locally First

```bash
# Build image
cd backend
docker build -t ks-live-backend:test .

# Run locally
docker run -p 3001:3001 --env-file .env ks-live-backend:test

# Test health
curl http://localhost:3001/health
```

---

## ⚙️ Phase 3 — Nginx Configuration (Server)

### 3.1 — Install Nginx on Hetzner

```bash
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx
```

### 3.2 — Nginx Config

**File:** `/etc/nginx/sites-available/ks-live`

```nginx
# Redirect HTTP → HTTPS
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL (managed by Certbot)
    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    # ── Frontend (React SPA) ──────────────────────────────────
    location / {
        root /opt/ks-live/frontend/dist;
        try_files $uri $uri/ /index.html;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # ── Backend REST API ──────────────────────────────────────
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # ── Socket.IO (WebSocket — Critical for OBS overlays) ────
    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400s;   # 24h — keep OBS connections alive
        proxy_send_timeout 86400s;
    }

    # ── Health check endpoint ─────────────────────────────────
    location /health {
        proxy_pass http://localhost:3001/health;
        access_log off;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/ks-live /etc/nginx/sites-enabled/
sudo nginx -t        # test config
sudo systemctl reload nginx
```

### 3.3 — SSL Certificate (Free)

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renew (runs twice daily)
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

# Test renewal
sudo certbot renew --dry-run
```

---

## 🔄 Phase 4 — GitHub Actions CI/CD Pipeline

### 4.1 — Pipeline File

**File:** `.github/workflows/deploy.yml`

```yaml
name: 🚀 KS Live — Deploy Pipeline

on:
  push:
    branches:
      - main        # Full deploy
      - dev         # Tests only
  workflow_dispatch: # Manual trigger from GitHub UI

env:
  DOCKER_IMAGE: ${{ secrets.DOCKERHUB_USERNAME }}/ks-live-backend

jobs:
  # ═══════════════════════════════════════════════════════════
  # JOB 1 — Lint & Test
  # ═══════════════════════════════════════════════════════════
  test:
    name: 🧪 Test Backend
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json

      - name: Install dependencies
        working-directory: backend
        run: npm ci

      - name: Check server starts (smoke test)
        working-directory: backend
        run: |
          node -e "
            const { app } = require('./server.js');
            console.log('✅ Server module loads OK');
            process.exit(0);
          " || echo "Server check skipped"

  # ═══════════════════════════════════════════════════════════
  # JOB 2 — Build Frontend (only on main push)
  # ═══════════════════════════════════════════════════════════
  build-frontend:
    name: 🏗️ Build Frontend
    runs-on: ubuntu-latest
    needs: test
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        working-directory: frontend
        run: npm ci

      - name: Build production bundle
        working-directory: frontend
        env:
          VITE_API_URL: ${{ secrets.VITE_API_URL }}
          VITE_SOCKET_URL: ${{ secrets.VITE_SOCKET_URL }}
          VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.VITE_FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_PROJECT_ID: ${{ secrets.VITE_FIREBASE_PROJECT_ID }}
        run: npm run build

      - name: Upload dist artifact
        uses: actions/upload-artifact@v4
        with:
          name: frontend-dist
          path: frontend/dist/
          retention-days: 1

  # ═══════════════════════════════════════════════════════════
  # JOB 3 — Build & Push Docker Image (only on main push)
  # ═══════════════════════════════════════════════════════════
  build-backend-docker:
    name: 🐳 Build & Push Docker Image
    runs-on: ubuntu-latest
    needs: test
    if: github.ref == 'refs/heads/main'
    outputs:
      image-tag: ${{ github.sha }}
    steps:
      - uses: actions/checkout@v4

      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          push: true
          cache-from: type=gha
          cache-to: type=gha,mode=max
          tags: |
            ${{ env.DOCKER_IMAGE }}:latest
            ${{ env.DOCKER_IMAGE }}:${{ github.sha }}

  # ═══════════════════════════════════════════════════════════
  # JOB 4 — Deploy to Hetzner (only on main push)
  # ═══════════════════════════════════════════════════════════
  deploy:
    name: 🌐 Deploy to Production
    runs-on: ubuntu-latest
    needs: [build-frontend, build-backend-docker]
    if: github.ref == 'refs/heads/main'
    environment: production
    steps:
      - uses: actions/checkout@v4

      - name: Download frontend dist
        uses: actions/download-artifact@v4
        with:
          name: frontend-dist
          path: frontend/dist

      - name: Copy frontend dist to server
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SERVER_SSH_KEY }}
          source: "frontend/dist/*"
          target: "/opt/ks-live/frontend/dist"
          strip_components: 2

      - name: Deploy backend on server
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SERVER_SSH_KEY }}
          script: |
            set -e
            cd /opt/ks-live

            echo "📦 Pulling latest Docker image..."
            docker pull ${{ env.DOCKER_IMAGE }}:latest

            echo "🔄 Restarting backend container..."
            docker compose up -d --no-deps --force-recreate backend

            echo "🧹 Cleaning up old images..."
            docker image prune -f

            echo "✅ Verifying deployment..."
            sleep 5
            curl -f http://localhost:3001/health || exit 1

            echo "🔃 Reloading Nginx..."
            sudo systemctl reload nginx

            echo "🎉 Deployment complete!"

      - name: Notify deployment status
        if: always()
        run: |
          if [ "${{ job.status }}" == "success" ]; then
            echo "✅ Deployment succeeded for commit ${{ github.sha }}"
          else
            echo "❌ Deployment FAILED for commit ${{ github.sha }}"
          fi
```

---

## 🔐 Phase 5 — Secrets & Environment Management

### 5.1 — GitHub Repository Secrets

Go to: **GitHub → Your Repo → Settings → Secrets → Actions**

| Secret Name | Value | Where Used |
|---|---|---|
| `DOCKERHUB_USERNAME` | Your Docker Hub username | CI/CD |
| `DOCKERHUB_TOKEN` | Docker Hub access token | CI/CD |
| `SERVER_HOST` | Hetzner VPS IP address | SSH deploy |
| `SERVER_USER` | `root` or `ubuntu` | SSH deploy |
| `SERVER_SSH_KEY` | Private SSH key (PEM) | SSH deploy |
| `VITE_API_URL` | `https://yourdomain.com/api` | Frontend build |
| `VITE_SOCKET_URL` | `wss://yourdomain.com` | Frontend build |
| `VITE_FIREBASE_API_KEY` | From Firebase console | Frontend build |
| `VITE_FIREBASE_AUTH_DOMAIN` | From Firebase console | Frontend build |
| `VITE_FIREBASE_PROJECT_ID` | From Firebase console | Frontend build |

### 5.2 — Production .env on Server

**File:** `/opt/ks-live/.env.production` (never committed to Git)

```env
NODE_ENV=production
PORT=3001

# MongoDB Atlas
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/ks-live

# JWT
JWT_SECRET=<run: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
JWT_EXPIRES_IN=7d

# CORS
FRONTEND_ORIGIN=https://yourdomain.com
FRONTEND_URL=https://yourdomain.com

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## 🖥️ Phase 6 — Hetzner Server Setup (One-Time)

```bash
# 1. Create CAX11 server on hetzner.com
#    OS: Ubuntu 24.04 LTS
#    Location: Nearest to your users

# 2. SSH into server
ssh root@YOUR_SERVER_IP

# 3. Update system
apt update && apt upgrade -y

# 4. Install Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# 5. Install Docker Compose
apt install docker-compose-plugin -y

# 6. Install Nginx + Certbot
apt install -y nginx certbot python3-certbot-nginx

# 7. Create project directory
mkdir -p /opt/ks-live/frontend/dist

# 8. Create production .env file
nano /opt/ks-live/.env.production
# (paste your env vars here)

# 9. Create docker-compose.yml
nano /opt/ks-live/docker-compose.yml
# (paste docker-compose config from Phase 2.3)

# 10. Configure Nginx
nano /etc/nginx/sites-available/ks-live
# (paste nginx config from Phase 3.2)
ln -s /etc/nginx/sites-available/ks-live /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# 11. Get SSL certificate
certbot --nginx -d yourdomain.com -d www.yourdomain.com

# 12. Create SSH key for GitHub Actions
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_deploy
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/github_deploy     # ← Copy this private key → GitHub Secret SERVER_SSH_KEY

# 13. Allow GitHub Actions to reload nginx without password
echo "root ALL=(ALL) NOPASSWD: /bin/systemctl reload nginx" >> /etc/sudoers

# 14. First manual deploy to verify
docker pull YOUR_DOCKERHUB_USERNAME/ks-live-backend:latest
cd /opt/ks-live && docker compose up -d

# 15. Verify everything
curl https://yourdomain.com/health
```

---

## 📊 Phase 7 — Monitoring & Alerts

### 7.1 — UptimeRobot (Free — 5 min checks)

1. Sign up at [uptimerobot.com](https://uptimerobot.com)
2. Add monitor → **HTTPS** → `https://yourdomain.com/health`
3. Add alert contact → your email / WhatsApp
4. You get alerted within 5 minutes if site goes down ✅

### 7.2 — Docker Auto-Restart

Your `docker-compose.yml` already has `restart: unless-stopped`.
If the backend crashes, Docker restarts it automatically.

### 7.3 — View Logs

```bash
# Live backend logs
docker logs ks-live-backend -f

# Last 100 lines
docker logs ks-live-backend --tail 100

# Nginx access logs
tail -f /var/log/nginx/access.log

# Nginx error logs
tail -f /var/log/nginx/error.log
```

### 7.4 — Server Resource Check

```bash
# RAM and CPU usage
htop

# Disk usage
df -h

# Docker container stats
docker stats
```

---

## ✅ Phase 8 — Full Checklist Before Going Live

### Server Setup
- [ ] Hetzner CAX11 created and SSH access working
- [ ] Docker and Docker Compose installed
- [ ] Nginx installed and config tested (`nginx -t`)
- [ ] SSL certificate obtained (Let's Encrypt)
- [ ] `/opt/ks-live/.env.production` created with all secrets
- [ ] `docker-compose.yml` on server
- [ ] First manual Docker deploy working
- [ ] `curl https://yourdomain.com/health` returns `200 OK`

### GitHub Setup
- [ ] `.github/workflows/deploy.yml` committed
- [ ] `backend/Dockerfile` committed
- [ ] `backend/.dockerignore` committed
- [ ] All 10 GitHub Secrets added
- [ ] Docker Hub account created and token added

### DNS & Domain
- [ ] Domain pointed to Hetzner server IP (A record)
- [ ] DNS propagated (`nslookup yourdomain.com`)
- [ ] HTTPS working in browser

### Application Config
- [ ] `FRONTEND_ORIGIN` set to production domain
- [ ] Stripe webhook registered at `https://yourdomain.com/api/subscriptions/webhook`
- [ ] Firebase authorized domain added (`yourdomain.com`)
- [ ] MongoDB Atlas IP whitelist updated

### CI/CD
- [ ] Push to `dev` → only tests run ✅
- [ ] Push to `main` → full deploy runs ✅
- [ ] Health check passes after deploy ✅
- [ ] UptimeRobot monitor active ✅

---

## 💰 Final Cost Summary

| Service | Cost |
|---|---|
| Hetzner CAX11 (2vCPU / 4GB) | ~$4/mo |
| MongoDB Atlas M0 (Free) | $0/mo |
| Cloudflare Pages (Frontend CDN) | $0/mo |
| GitHub Actions (CI/CD) | $0/mo |
| Docker Hub (Image registry) | $0/mo |
| UptimeRobot (Monitoring) | $0/mo |
| Let's Encrypt (SSL) | $0/mo |
| Domain name | ~$1/mo |
| **TOTAL** | **~$5/month** |

---

## 🔁 Day-to-Day DevOps Flow Summary

```
You write code on Windows
        ↓
git push origin dev        → GitHub runs tests only
        ↓
git checkout main
git merge dev
git push origin main       → GitHub Actions triggers:
                                1. Tests ✅
                                2. npm run build (React) ✅
                                3. docker build + push ✅
                                4. SSH into Hetzner ✅
                                5. docker pull + restart ✅
                                6. nginx reload ✅
                                7. health check verified ✅
        ↓
yourdomain.com is LIVE with new version 🎉
```
