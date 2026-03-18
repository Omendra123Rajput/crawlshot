# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**CrawlShot** — a Website Screenshot Crawler SaaS platform. Submit a URL, crawl all internal pages (up to 10k), capture full-page screenshots at Desktop (1920x1080) and Mobile (390x844) viewports via Playwright, stream progress via SSE, and package results into a downloadable ZIP.

## Architecture

Monorepo using npm workspaces + Turborepo. Three layers:

- **`apps/web`** — Next.js 14 (App Router) frontend. Dark-themed glassmorphism UI with THREE.js WebGL shader background. Connects to API via SSE for real-time progress. Hosted on Vercel.
- **`apps/api`** — Express server. Job management (CRUD), SSE streaming via Redis Pub/Sub, ZIP download endpoint. Validates with zod, rate-limits with express-rate-limit, secures with helmet.
- **`services/worker`** — BullMQ worker process. Runs crawl and screenshot jobs from Redis queues. Broadcasts progress events via Redis Pub/Sub.

API + Worker run in a single Railway container via `Dockerfile.combined` and `start.sh`.

Shared packages:
- **`packages/crawler`** — Link discovery (HTML parsing via node-html-parser), robots.txt/sitemap.xml parsing, SSRF guard (DNS resolution + IP range blocking), URL normalization.
- **`packages/screenshot-engine`** — Playwright browser pool with auto-recovery on crash, full-page capture pipeline (navigate → scroll for lazy-load → settle → screenshot), path sanitization.
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

- SSRF guard (`packages/crawler/src/ssrf-guard.ts`) must run before ANY Playwright navigation or URL fetch. Blocks private IPs, link-local, cloud metadata endpoints. Also runs at capture time (TOCTOU defense).
- Path sanitization (`packages/screenshot-engine/src/sanitize-path.ts`) required on every file write. Uses `path.resolve()` + `startsWith()` guard.
- ZIP size capped at `MAX_ZIP_SIZE_MB` env var. Browser contexts are isolated per-screenshot with no permissions granted.
- Only HTTPS URLs accepted. All request bodies validated with zod schemas.
- All `:jobId` route params validated as UUID format before processing.
- No public job listing endpoint — jobs are only accessible by their UUID.
- Crawler redirect following capped at 5 hops to prevent redirect loops.

## Environment Variables

All defined in `.env.example`. Key ones: `REDIS_URL`, `SCREENSHOT_PATH`, `ALLOWED_ORIGINS`, `NEXT_PUBLIC_API_URL`.

## Queue Design

Two BullMQ queues backed by Redis:
- `crawl` — concurrency 5, 1 attempt, feeds pages into screenshot queue
- `screenshot` — concurrency 10, 3 attempts with exponential backoff (3s base)

Worker-to-API communication uses Redis Pub/Sub channels (`job:{jobId}:events`).

## Working Principles

- **Simplicity first** — Make every change as simple as possible. Minimal code impact.
- **No laziness** — Find root causes. No temporary fixes. Senior developer standards.
- **Minimal impact** — Only touch what's necessary. No side effects or new bugs.
- **Plan before building** — Enter plan mode for any non-trivial task (3+ steps or architectural decisions). If something goes sideways, stop and re-plan.
- **Verify before done** — Never mark a task complete without proving it works. Run tests, check logs, demonstrate correctness.
- **Demand elegance (balanced)** — For non-trivial changes, ask "is there a more elegant way?" Skip this for simple, obvious fixes.
- **Autonomous bug fixing** — When given a bug report, just fix it. Point at logs, errors, failing tests — then resolve them. Zero hand-holding required.

## Task Management

1. Write plan with checkable items before starting
2. Check in before implementing
3. Mark items complete as you go
4. Explain changes with high-level summary at each step
5. Capture lessons after corrections to avoid repeating mistakes
