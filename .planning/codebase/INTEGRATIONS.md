# External Integrations

**Analysis Date:** 2026-03-12

## APIs & External Services

**Browser Automation:**
- Playwright (Chromium) - Full-page screenshot capture via headless browser
  - SDK/Client: `playwright` package 1.44.0
  - Configuration: `packages/screenshot-engine/src/browser-pool.ts`
  - Launch args: `--no-sandbox`, `--disable-setuid-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu`, `--disable-features=VizDisplayCompositor`
  - Max concurrent browsers: `SCREENSHOT_CONCURRENCY` (10) from `packages/utils/src/constants.ts`

**HTTP/URL Fetching:**
- None detected - Uses Playwright navigation for all URL fetching (includes SSRF guards)

## Data Storage

**Databases:**
- None (No traditional database) - Job state stored in-memory via JavaScript object in `apps/api/src/services/job-store.ts`

**Message Broker/Queue:**
- Redis 7-alpine (docker service)
  - Connection: `REDIS_URL` environment variable
  - Client: ioredis 5.4.0
  - Usage:
    - BullMQ queue backend for `crawl` and `screenshot` jobs
    - Pub/Sub channels for job progress broadcasting (`job:{jobId}:events`)
  - Configuration: `packages/queue/src/redis-connection.ts` with retry strategy (exponential backoff, max 5000ms delay)

**File Storage:**
- Local filesystem only
  - Path: `SCREENSHOT_PATH` environment variable (default: `/tmp/screenshots`)
  - Subdirectory per job: `{jobId}/`
  - Screenshots saved as PNG files
  - ZIP archive created in job directory
  - Path traversal guards: `path.resolve()` + `startsWith()` validation in download route (`apps/api/src/routes/download.ts`)
  - Sanitization: `packages/screenshot-engine/src/sanitize-path.ts` used on all file writes

**Caching:**
- Redis (implicit via queue structure, no explicit cache layer detected)

## Authentication & Identity

**Auth Provider:**
- None - No authentication layer implemented
- Public endpoints with rate limiting as access control:
  - Job creation limiter: 20 requests per 15 minutes (`apps/api/src/middleware/rate-limit.ts`)
  - General endpoint limiter: 200 requests per 15 minutes

**CORS:**
- Configuration: `apps/api/src/middleware/cors.ts`
- Allowed origins: `ALLOWED_ORIGINS` environment variable (comma-separated)
- Methods: GET, POST
- Headers: Content-Type, Authorization
- Credentials: enabled

## Monitoring & Observability

**Error Tracking:**
- None detected - No external error tracking service

**Logs:**
- Pino 9.0.0 structured logger
  - Level: debug (development), info (production)
  - Output: stdout with ISO timestamps
  - Configuration: `packages/utils/src/logger.ts`
  - Usage: All services (`apps/api`, `services/worker`, `packages/*`) use shared logger
  - Request logging: pino-http middleware for Express requests
  - Child loggers: Context-aware logging with jobId, url, etc. (`services/worker/src/crawl-worker.ts`)

**Metrics:**
- None detected - No metrics collection/export service

## CI/CD & Deployment

**Hosting:**
- Docker Compose (local development/deployment)
  - Services: api, worker, redis
  - Network: `crawler-net` bridge network
  - Volumes:
    - `redis_data` - Redis persistence
    - `screenshots_data` - Screenshot storage across containers
  - Health checks: Redis readiness check before API/worker startup

**CI Pipeline:**
- None detected in repository

**Build:**
- Turbo 2.0.0 orchestrates builds across monorepo workspaces
- Commands:
  ```bash
  npm run build          # Compiles all packages (tsc)
  npm run type-check     # Type-check all workspaces
  npm run dev            # Parallel dev servers (API :3001, Web :3000, Worker process)
  ```

## Environment Configuration

**Required env vars (from `.env.example`):**
- `PORT` - API server port (default: 3001)
- `NODE_ENV` - Environment (development|production|test)
- `REDIS_URL` - Redis connection (local: `redis://localhost:6379` | Upstash: `rediss://...@....upstash.io:6379`)
- `SCREENSHOT_PATH` - Absolute path for screenshot storage (e.g., `/tmp/screenshots`)
- `ALLOWED_ORIGINS` - CORS whitelist (e.g., `http://localhost:3000`)
- `MAX_ZIP_SIZE_MB` - ZIP package size limit (default: 500)
- `NEXT_PUBLIC_API_URL` - Frontend API endpoint (e.g., `http://localhost:3001`)

**Secrets location:**
- `.env` file (gitignored, not committed)
- Environment variables injected via Docker `env_file` directive in `docker-compose.yml`

## Webhooks & Callbacks

**Incoming:**
- None - No webhook endpoints

**Outgoing:**
- None - No outbound webhooks to external services

## Job Processing

**Queue System:**
- BullMQ 5.0.0 with Redis backend
- Two named queues (from `packages/queue/src/index.ts`):
  - `crawl` - Concurrency: 5, Max attempts: 1, Discovers pages via HTML parsing
  - `screenshot` - Concurrency: 10, Max attempts: 3 with exponential backoff (3s base)
- Job types:
  - `CrawlJobData` - `{ jobId, url, viewports }`
  - `ScreenshotJobData` - `{ jobId, url, viewport, filePath }`

**Worker-to-API Communication:**
- Redis Pub/Sub channels (`job:{jobId}:events`)
- SSE (Server-Sent Events) over HTTP for frontend real-time updates
- Broadcast service: `apps/api/src/services/sse-broadcaster.ts` subscribes to Redis Pub/Sub and streams to connected HTTP clients

## Security Controls

**SSRF Guard:**
- Implementation: `packages/crawler/src/ssrf-guard.ts`
- DNS resolution before navigation (IPv4 and IPv6)
- Blocked CIDR ranges: 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, 0.0.0.0/8, 100.64.0.0/10, 192.0.0.0/24, 198.18.0.0/15, 224.0.0.0/4, 240.0.0.0/4, ::1/128, fc00::/7, fe80::/10
- Blocked hostnames: localhost, metadata.google.internal, 169.254.169.254, [::1]
- HTTPS-only enforcement: URLs must use `https://` scheme
- Called before any Playwright navigation (`apps/api/src/routes/jobs.ts`)

**Path Traversal Guard:**
- Implementation: `packages/screenshot-engine/src/sanitize-path.ts`
- `path.resolve()` + `startsWith()` validation on all file writes
- Download endpoint validates job directory path (`apps/api/src/routes/download.ts`)

**Input Validation:**
- Zod 3.23.0 schemas for all API inputs:
  - Job creation: URL validation, viewport enum (desktop|mobile), HTTPS enforcement (`apps/api/src/routes/jobs.ts`)
  - Max URL length: 2048 characters
  - Request body size limit: 10KB

**Security Headers:**
- Helmet 7.1.0 middleware (`apps/api/src/index.ts`)

**Rate Limiting:**
- Job creation: 20 per 15 minutes
- General endpoints: 200 per 15 minutes

**Browser Isolation:**
- Each screenshot uses isolated browser context (no permissions granted)
- No cookies/local storage persistence between captures

---

*Integration audit: 2026-03-12*
