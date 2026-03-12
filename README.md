# Screenshot Crawler

A full-stack Website Screenshot Crawler SaaS platform. Submit a URL, crawl all internal pages (up to 10,000), capture full-page screenshots at Desktop (1920×1080) and Mobile (390×844) viewports, and download them as a ZIP.

## Prerequisites

- Node.js 20+, npm 10+
- Docker Desktop (for Redis)

## Quick Start (Local)

```bash
git clone <repo> && cd screenshot-crawler
cp .env.example .env
docker compose up -d redis        # Start Redis only
npm install                        # Install all workspaces
npx playwright install chromium    # Install browser
npm run dev                        # Start all services in parallel
```

Open http://localhost:3000

## Run With Full Docker

```bash
docker compose up --build
```

## Architecture

```
apps/web        → Next.js 14 frontend (landing page + dashboard with SSE)
apps/api        → Express API server (job management, SSE streaming, ZIP download)
services/worker → BullMQ workers (crawl + screenshot processing)
packages/       → Shared libraries (crawler, screenshot-engine, queue, storage, utils)
```

**Flow:** User submits URL → API creates job → Crawl worker discovers pages → Screenshot worker captures each page → Storage packages ZIP → User downloads

## Deployment (Free Tier)

### Frontend → Vercel

1. Connect repo to Vercel
2. Set Root Directory: `apps/web`
3. Set env var: `NEXT_PUBLIC_API_URL=https://your-api.onrender.com`
4. Deploy

### Backend + Worker → Render.com

1. Create two services: one Web Service for `apps/api`, one Background Worker for `services/worker`
2. Add Upstash Redis (free tier) — get `REDIS_URL` from console.upstash.com
3. Set all env vars from `.env.example`
4. Deploy
