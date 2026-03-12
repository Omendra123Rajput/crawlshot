# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**CrawlShot** — a Website Screenshot Crawler SaaS platform. Submit a URL, crawl all internal pages (up to 10k), capture full-page screenshots at Desktop (1920x1080) and Mobile (390x844) viewports via Playwright, stream progress via SSE, and package results into a downloadable ZIP.

## Architecture

Monorepo using npm workspaces + Turborepo. Three layers:

- **`apps/web`** — Next.js 14 (App Router) frontend. Dark-themed glassmorphism UI with THREE.js WebGL shader background. Connects to API via SSE for real-time progress.
- **`apps/api`** — Express server. Job management (CRUD), SSE streaming via Redis Pub/Sub, ZIP download endpoint. Validates with zod, rate-limits with express-rate-limit, secures with helmet.
- **`services/worker`** — BullMQ worker process. Runs crawl and screenshot jobs from Redis queues. Broadcasts progress events via Redis Pub/Sub.

Shared packages:
- **`packages/crawler`** — Link discovery (HTML parsing via node-html-parser), robots.txt/sitemap.xml parsing, SSRF guard (DNS resolution + IP range blocking), URL normalization.
- **`packages/screenshot-engine`** — Playwright browser pool (max 10), full-page capture pipeline (navigate → scroll for lazy-load → settle → screenshot), path sanitization.
- **`packages/queue`** — BullMQ queue definitions (crawl + screenshot) and shared Redis connection.
- **`packages/storage`** — File writer with path traversal guards, ZIP packager using archiver (zlib level 6, size-capped).
- **`packages/utils`** — Pino logger, exponential backoff retry, shared constants (timeouts, concurrency, viewports).

## Data Flow

`POST /api/jobs` → SSRF guard → create job → enqueue crawl job →
crawl worker discovers pages → enqueues screenshot jobs per page/viewport →
screenshot worker captures via Playwright → broadcasts progress via Redis Pub/Sub →
API SSE endpoint streams to frontend → on completion, packages ZIP →
`GET /api/jobs/:id/download` streams ZIP

## Commands

```bash
# Prerequisites: Node.js 20+, Docker Desktop

# Setup
cp .env.example .env
docker compose up -d redis        # Start Redis
npm install                        # Install all workspaces
npx playwright install chromium    # Install Chromium

# Development (starts API, worker, and web in parallel)
npm run dev

# Build all packages
npm run build

# Type-check all packages
npm run type-check

# Start individual services
cd apps/api && npm run dev         # API on :3001
cd services/worker && npm run dev  # Worker process
cd apps/web && npm run dev         # Frontend on :3000
```

## Key Security Constraints

- SSRF guard (`packages/crawler/src/ssrf-guard.ts`) must run before ANY Playwright navigation or URL fetch. Blocks private IPs, link-local, cloud metadata endpoints.
- Path sanitization (`packages/screenshot-engine/src/sanitize-path.ts`) required on every file write. Uses `path.resolve()` + `startsWith()` guard.
- ZIP size capped at `MAX_ZIP_SIZE_MB` env var. Browser contexts are isolated per-screenshot with no permissions granted.
- Only HTTPS URLs accepted. All request bodies validated with zod schemas.

## Environment Variables

All defined in `.env.example`. Key ones: `REDIS_URL`, `SCREENSHOT_PATH`, `ALLOWED_ORIGINS`, `NEXT_PUBLIC_API_URL`.

## Queue Design

Two BullMQ queues backed by Redis:
- `crawl` — concurrency 5, 1 attempt, feeds pages into screenshot queue
- `screenshot` — concurrency 10, 3 attempts with exponential backoff (3s base)

Worker-to-API communication uses Redis Pub/Sub channels (`job:{jobId}:events`).
