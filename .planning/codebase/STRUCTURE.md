# Codebase Structure

**Analysis Date:** 2026-03-12

## Directory Layout

```
site-screenshots-cc/                       # Monorepo root (npm workspaces + Turborepo)
├── apps/                                   # Applications (frontend, API server)
│   ├── web/                                # Next.js 14 frontend (App Router)
│   │   ├── app/                            # Next.js app directory (routes)
│   │   │   ├── page.tsx                    # Home page (landing, scan form)
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx                # Job tracking dashboard
│   │   │   └── layout.tsx                  # Root layout (metadata, providers)
│   │   ├── components/                     # React components
│   │   │   ├── animated-shader-background.tsx  # THREE.js WebGL background
│   │   │   ├── scan-form.tsx               # Job submission form
│   │   │   ├── job-progress.tsx            # Progress display with stats
│   │   │   ├── screenshot-grid.tsx         # Screenshot preview gallery
│   │   │   └── download-button.tsx         # ZIP download button
│   │   ├── lib/                            # Client utilities
│   │   │   ├── api-client.ts               # API fetch wrappers (createJob, getJob, SSE URL)
│   │   │   ├── sse-client.ts               # useSSE hook for real-time event streaming
│   │   │   └── utils.ts                    # Tailwind/formatting helpers
│   │   ├── tailwind.config.ts              # Tailwind CSS config (glass design system)
│   │   ├── next.config.mjs                 # Next.js config
│   │   ├── tsconfig.json                   # TypeScript config (extends root)
│   │   └── package.json                    # Dependencies (next, react, tailwindcss, three)
│   │
│   └── api/                                # Express server
│       ├── src/
│       │   ├── index.ts                    # Server entry point (app initialization, middleware stack)
│       │   ├── config.ts                   # Environment config (PORT, REDIS_URL, ALLOWED_ORIGINS)
│       │   ├── middleware/                 # Express middleware
│       │   │   ├── cors.ts                 # CORS configuration
│       │   │   ├── error-handler.ts        # Global error handler (catches AppError subclasses)
│       │   │   ├── rate-limit.ts           # express-rate-limit (general + job creation limiters)
│       │   │   └── validate.ts             # Zod schema validation middleware
│       │   ├── routes/                     # Route handlers
│       │   │   ├── jobs.ts                 # POST /api/jobs (create), GET /api/jobs/:jobId, GET /api/jobs
│       │   │   ├── sse.ts                  # GET /api/jobs/:jobId/stream (SSE subscription)
│       │   │   └── download.ts             # GET /api/jobs/:jobId/download (ZIP download)
│       │   ├── services/                   # Business logic
│       │   │   ├── job-store.ts            # In-memory job CRUD (Map<jobId, JobRecord>)
│       │   │   └── sse-broadcaster.ts      # Redis Pub/Sub subscription + SSE event forwarding
│       │   └── types/
│       │       └── index.ts                # Shared types (JobRecord, SSEEvent, AppError subclasses)
│       ├── tsconfig.json                   # TypeScript config
│       └── package.json                    # Dependencies (express, helmet, zod, pino-http)
│
├── services/                               # Background services (workers)
│   └── worker/                             # BullMQ job workers
│       └── src/
│           ├── index.ts                    # Worker process entry point (starts crawl + screenshot workers)
│           ├── crawl-worker.ts             # BullMQ Worker for CrawlJob (calls crawlSite, enqueues screenshots)
│           ├── screenshot-worker.ts        # BullMQ Worker for ScreenshotJob (calls engine.capture, packages ZIP)
│           └── broadcast.ts                # Job stats tracking + Redis Pub/Sub event broadcaster
│
├── packages/                               # Shared libraries (reusable across apps/services)
│   ├── crawler/                            # Link discovery + SSRF protection
│   │   └── src/
│   │       ├── index.ts                    # Main export: crawlSite() function
│   │       ├── link-extractor.ts           # HTML parsing via node-html-parser, extracts <a> hrefs
│   │       ├── robots-parser.ts            # Parses robots.txt (respects User-agent, Disallow)
│   │       ├── sitemap-parser.ts           # Parses sitemap.xml (extracts URLs)
│   │       ├── ssrf-guard.ts               # DNS resolution + IP range checking (blocks private IPs)
│   │       └── url-normalizer.ts           # URL normalization (resolves relative → absolute, dedupes)
│   │
│   ├── screenshot-engine/                  # Browser pool + page capture pipeline
│   │   └── src/
│   │       ├── index.ts                    # ScreenshotEngine class (initialize, capture, close)
│   │       ├── browser-pool.ts             # BrowserPool singleton (max 10 Chromium instances, round-robin)
│   │       ├── capture.ts                  # capturePage() pipeline (navigate → scroll → settle → screenshot)
│   │       ├── sanitize-path.ts            # Path traversal guards (safePath, sanitizeFilename)
│   │       └── scroll-trigger.ts           # Scrolls page to trigger lazy-loaded content
│   │
│   ├── queue/                              # BullMQ queue definitions + Redis connection
│   │   └── src/
│   │       ├── index.ts                    # Exports (queues, Redis connection, types)
│   │       ├── redis-connection.ts         # Shared Redis client (ioredis singleton)
│   │       ├── crawl-queue.ts              # getCrawlQueue(), addCrawlJob() (concurrency 5, 1 attempt)
│   │       └── screenshot-queue.ts         # getScreenshotQueue(), addScreenshotJob() (concurrency 10, 3 attempts)
│   │
│   ├── storage/                            # File I/O + ZIP packaging
│   │   └── src/
│   │       ├── index.ts                    # Main exports
│   │       ├── file-writer.ts              # saveScreenshot() (validates path, writes PNG)
│   │       └── zip-packager.ts             # packageJob() (archiver with zlib level 6, size-capped)
│   │
│   └── utils/                              # Shared utilities + constants
│       └── src/
│           ├── index.ts                    # Main exports
│           ├── constants.ts                # MAX_PAGES (10k), VIEWPORTS (desktop/mobile), timeouts, concurrency
│           ├── logger.ts                   # Pino logger configuration
│           └── retry.ts                    # Exponential backoff retry helper
│
├── .planning/
│   └── codebase/                           # Codebase analysis documents (generated)
│       ├── ARCHITECTURE.md                 # Architecture overview (layers, data flow)
│       └── STRUCTURE.md                    # This file
│
├── .env.example                            # Environment variables template
├── package.json                            # Root workspace config (npm 11.8.0, workspaces)
├── turbo.json                              # Turborepo config (dev, build, type-check tasks)
├── tsconfig.json                           # Root TypeScript config
└── CLAUDE.md                               # Project documentation (overview, setup, security)
```

## Directory Purposes

**apps/web:**
- Purpose: Next.js 14 frontend application (React UI)
- Contains: Page routes (home, dashboard), components (form, progress, grid), client utilities (API client, SSE hook)
- Key files: `app/page.tsx` (landing), `app/dashboard/page.tsx` (job tracking), `components/scan-form.tsx` (form handling)

**apps/api:**
- Purpose: Express REST API server
- Contains: Route handlers (CRUD jobs, SSE, download), middleware (validation, errors, rate limiting), job state store, SSE broadcaster
- Key files: `src/index.ts` (server entry), `src/routes/jobs.ts` (job endpoints), `src/services/job-store.ts` (state)

**services/worker:**
- Purpose: Background job processing service (BullMQ workers)
- Contains: Crawl worker (link discovery), screenshot worker (Playwright capture), broadcast module (progress events)
- Key files: `src/index.ts` (worker startup), `src/crawl-worker.ts` (crawl logic), `src/screenshot-worker.ts` (capture logic)

**packages/crawler:**
- Purpose: Reusable web crawling library (link discovery with SSRF protection)
- Contains: Link extractor, robots/sitemap parsers, SSRF guard, URL normalizer, main crawlSite() function
- Key files: `src/index.ts` (crawlSite export), `src/ssrf-guard.ts` (security), `src/link-extractor.ts` (HTML parsing)

**packages/screenshot-engine:**
- Purpose: Reusable browser pool + page capture library (Playwright abstraction)
- Contains: Browser pool (round-robin Chromium management), capture pipeline (navigate → scroll → settle → screenshot), path sanitization
- Key files: `src/index.ts` (ScreenshotEngine class), `src/browser-pool.ts` (pool management), `src/capture.ts` (pipeline)

**packages/queue:**
- Purpose: Shared queue definitions and Redis connection (BullMQ setup)
- Contains: Crawl queue, screenshot queue, Redis connection, job data types
- Key files: `src/index.ts` (exports), `src/redis-connection.ts` (Redis singleton), `src/crawl-queue.ts`, `src/screenshot-queue.ts`

**packages/storage:**
- Purpose: File I/O and ZIP packaging
- Contains: File writer (with path traversal guards), ZIP packager (archiver-based)
- Key files: `src/file-writer.ts` (PNG save), `src/zip-packager.ts` (ZIP creation)

**packages/utils:**
- Purpose: Shared constants, logger, retry logic
- Contains: Constants (MAX_PAGES, VIEWPORTS, timeouts, concurrency), Pino logger, exponential backoff retry
- Key files: `src/constants.ts` (centralized config), `src/logger.ts` (logging setup), `src/retry.ts` (retry helper)

## Key File Locations

**Entry Points:**
- Frontend: `apps/web/app/page.tsx` (home landing)
- API: `apps/api/src/index.ts` (Express server startup)
- Worker: `services/worker/src/index.ts` (worker startup)
- Dashboard: `apps/web/app/dashboard/page.tsx` (job tracking page)

**Configuration:**
- Environment: `.env.example` (template for all env vars)
- Turborepo: `turbo.json` (task definitions, caching)
- TypeScript (root): `tsconfig.json` (root config, extended by workspaces)
- TypeScript (apps/web): `apps/web/tsconfig.json`
- TypeScript (apps/api): `apps/api/tsconfig.json`
- Tailwind: `apps/web/tailwind.config.ts` (design system, glass effects)
- Next.js: `apps/web/next.config.mjs`

**Core Logic:**
- Job Creation: `apps/api/src/routes/jobs.ts` (POST /api/jobs → validation → SSRF guard → queue)
- Crawling: `packages/crawler/src/index.ts` (crawlSite main function)
- Screenshots: `packages/screenshot-engine/src/capture.ts` (capturePage pipeline)
- Browser Pool: `packages/screenshot-engine/src/browser-pool.ts` (round-robin management)
- Job State: `apps/api/src/services/job-store.ts` (in-memory Map-based store)
- Progress Streaming: `apps/api/src/services/sse-broadcaster.ts` (Redis Pub/Sub → SSE)
- Crawl Worker: `services/worker/src/crawl-worker.ts` (BullMQ worker handler)
- Screenshot Worker: `services/worker/src/screenshot-worker.ts` (BullMQ worker handler)
- ZIP Packaging: `packages/storage/src/zip-packager.ts` (archiver-based ZIP creation)

**Security:**
- SSRF Guard: `packages/crawler/src/ssrf-guard.ts` (DNS + IP range checks)
- Path Sanitization: `packages/screenshot-engine/src/sanitize-path.ts` (traversal prevention)
- Rate Limiting: `apps/api/src/middleware/rate-limit.ts` (express-rate-limit setup)
- CORS: `apps/api/src/middleware/cors.ts` (origin whitelist)
- Validation: `apps/api/src/middleware/validate.ts` (Zod schema enforcement)
- Error Handling: `apps/api/src/middleware/error-handler.ts` (centralized error catcher)

## Naming Conventions

**Files:**
- TypeScript: `.ts` (services, utilities, workers), `.tsx` (React components)
- Config: lowercase with dash (e.g., `next.config.mjs`, `tailwind.config.ts`, `turbo.json`)
- Constants: ALL_CAPS with underscore (e.g., `MAX_PAGES`, `PAGE_LOAD_TIMEOUT_MS`, `QUEUE_NAMES`)
- Utilities: descriptive camelCase with function name (e.g., `link-extractor.ts`, `url-normalizer.ts`)

**Directories:**
- Apps: lowercase, descriptive (e.g., `web`, `api`)
- Packages: lowercase, descriptive, dash-separated (e.g., `screenshot-engine`, `crawler`)
- Services: lowercase, descriptive (e.g., `worker`)
- Feature directories: lowercase (e.g., `middleware`, `routes`, `services`, `components`)

**Functions:**
- Main exports: camelCase (e.g., `crawlSite`, `capturePage`, `guardUrl`)
- Class methods: camelCase (e.g., `initialize()`, `capture()`, `getBrowser()`)
- Callbacks: descriptive with `on`/`handle` prefix (e.g., `onPageFound`, `handleError`)
- Internal utilities: camelCase with `_` prefix for private (convention, not enforced) (e.g., `_throttle`)

**Variables:**
- Constants (module-level): ALL_CAPS (e.g., `MAX_PAGES`, `BLOCKED_CIDRS`)
- Regular variables: camelCase (e.g., `foundPages`, `viewportConfig`)
- Booleans: `is` prefix (e.g., `isAllowed`, `initialized`)

**Types & Interfaces:**
- Interfaces: PascalCase with `I` prefix optional (e.g., `JobRecord`, `CreateJobRequest`, `CrawlJobData`)
- Types: PascalCase (e.g., `JobStatus`, `ViewportKey`, `SSEEvent`)
- Enums: Not used; prefer string literal unions (e.g., `type JobStatus = 'queued' | 'crawling'...`)

**Component Names:**
- React components: PascalCase (e.g., `ScanForm`, `ScreenshotGrid`, `AnimatedShaderBackground`)
- Page components: lowercase with directory (e.g., `app/page.tsx`, `app/dashboard/page.tsx`)

## Where to Add New Code

**New Feature (e.g., screenshot editing, batch jobs):**
- Primary code: New directory under `apps/api/src/routes/` (for API endpoints) or `apps/web/app/` (for pages)
- Tests: Sibling `.test.ts` or `.spec.ts` file (if testing is implemented)
- Shared logic: Extract to `packages/` if used across worker/API

**New Component/Module:**
- React component: `apps/web/components/[ComponentName].tsx`
- API route: `apps/api/src/routes/[feature].ts`, then import/mount in `src/index.ts`
- Utility function: `packages/utils/src/[utility-name].ts` if shared, else `[app]/src/lib/[name].ts` if app-specific
- Worker job type: `services/worker/src/[job-type]-worker.ts` and define in `packages/queue/src/[job-type]-queue.ts`

**Utilities/Helpers:**
- Shared across all packages/apps: `packages/utils/src/`
- Shared within one app: `apps/[app]/lib/` or `apps/[app]/src/lib/`
- Package-specific: `packages/[package]/src/`

**Middleware/Services:**
- Request middleware: `apps/api/src/middleware/[concern].ts` (imported in `src/index.ts`)
- Business logic services: `apps/api/src/services/[domain].ts`

## Special Directories

**node_modules:**
- Purpose: Installed dependencies (npm install)
- Generated: Yes
- Committed: No (in .gitignore)
- Note: Workspaces setup via `package.json` workspaces field

**.next:**
- Purpose: Next.js build output and cache
- Generated: Yes (during `npm run build` or dev)
- Committed: No (in .gitignore)

**dist:**
- Purpose: Compiled TypeScript output
- Generated: Yes (via `npm run build` in each package)
- Committed: No (in .gitignore)
- Note: Each package has its own `dist/` directory

**.turbo:**
- Purpose: Turborepo cache and metadata
- Generated: Yes
- Committed: No (in .gitignore)

**.env:**
- Purpose: Environment variables (secrets, configuration)
- Generated: No (must be created manually from `.env.example`)
- Committed: No (in .gitignore)
- Note: Required for local development and production

---

*Structure analysis: 2026-03-12*
