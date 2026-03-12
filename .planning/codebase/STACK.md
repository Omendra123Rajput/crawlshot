# Technology Stack

**Analysis Date:** 2026-03-12

## Languages

**Primary:**
- TypeScript 5.4.0 - All source code, compilation to CommonJS for backend, ES2022 targets for API/Worker

**Compiled to:**
- JavaScript (CommonJS for Node.js backend, ESM for Next.js frontend)

## Runtime

**Environment:**
- Node.js 20+ (specified as prerequisite in CLAUDE.md)

**Package Manager:**
- npm 11.8.0
- Lockfile: package-lock.json (present)

## Frameworks

**Backend:**
- Express 4.19.0 - HTTP server, routing, middleware orchestration (`apps/api/src/index.ts`)

**Frontend:**
- Next.js 14.2.0 (App Router) - Server-side rendered React app, API proxying via rewrites, running on port 3000 (`apps/web`)

**Worker Process:**
- No framework - Standalone Node.js process using raw BullMQ consumer pattern (`services/worker/src/index.ts`)

**UI Components:**
- React 18.3.0 - Component library for Next.js frontend
- Lucide React 0.378.0 - Icon library (`apps/web/package.json`)
- Tailwind CSS 3.4.0 - Utility-first styling
- Three.js 0.164.0 - WebGL shader background rendering for dark-themed glassmorphism UI

**Testing:**
- Not detected in package.json - No test framework configured

**Build/Dev:**
- Turbo 2.0.0 - Monorepo build orchestration and parallel task execution (`npm run dev` starts all services in parallel)
- TypeScript 5.4.0 - Type checking and compilation
- tsx 4.0.0 - TypeScript execution for Node.js (watch mode development)
- PostCSS 8.4.0 - CSS transformation pipeline
- Autoprefixer 10.4.0 - CSS vendor prefix injection

## Key Dependencies

**Critical:**

- **BullMQ 5.0.0** - Redis-backed job queue system for distributed crawl and screenshot tasks (`packages/queue`)
- **ioredis 5.4.0** - Redis client for queue management and Pub/Sub messaging
- **Playwright 1.44.0** - Browser automation for screenshot capture via Chromium headless mode (`packages/crawler`, `packages/screenshot-engine`)
- **Zod 3.23.0** - Runtime schema validation for API request bodies (`apps/api/src/routes/jobs.ts`)
- **Helmet 7.1.0** - Express security headers middleware (`apps/api/src/index.ts`)
- **express-rate-limit 7.2.0** - Rate limiting middleware (15-minute window, 20 job-creation limit, 200 general requests) (`apps/api/src/middleware/rate-limit.ts`)
- **Pino 9.0.0** - Structured logging (debug level in dev, info in production) (`packages/utils/src/logger.ts`)
- **pino-http 10.0.0** - HTTP request logging middleware for Express

**Infrastructure:**

- **archiver 7.0.0** - ZIP packager for screenshot results (zlib level 6, size-capped at MAX_ZIP_SIZE_MB) (`packages/storage`)
- **node-html-parser 6.1.0** - HTML parsing for link extraction during crawl phase (`packages/crawler/src/link-extractor.ts`)
- **fast-xml-parser 4.3.0** - XML parsing for robots.txt and sitemap.xml parsing (`packages/crawler/src/robots-parser.ts`, `packages/crawler/src/sitemap-parser.ts`)
- **ip-range-check 0.2.0** - CIDR range validation for SSRF guard (`packages/crawler/src/ssrf-guard.ts`)
- **p-throttle 5.1.0** - Request throttling for concurrent page crawling (`packages/crawler`)
- **p-limit 5.0.0** - Concurrency limiting for browser context management (`packages/screenshot-engine`)
- **uuid 9.0.0** - Job ID generation (`apps/api/src/routes/jobs.ts`)
- **cors 2.8.5** - CORS middleware for cross-origin requests (`apps/api/src/middleware/cors.ts`)
- **clsx 2.1.0** - Conditional CSS class composition for React (`apps/web/package.json`)
- **tailwind-merge 2.3.0** - Tailwind class merging to prevent conflicts

## Configuration

**Environment:**
- `.env` file required (template: `.env.example`)
- Environment variables validated at runtime via Zod schema in `apps/api/src/config.ts`
- Key configs:
  - `PORT` - API server port (default: 3001)
  - `NODE_ENV` - deployment environment (development|production|test)
  - `REDIS_URL` - Redis connection string (supports local or Upstash)
  - `SCREENSHOT_PATH` - Absolute filesystem path for screenshot storage
  - `ALLOWED_ORIGINS` - CORS whitelist (comma-separated)
  - `MAX_ZIP_SIZE_MB` - ZIP package size limit (default: 500)
  - `NEXT_PUBLIC_API_URL` - Frontend API endpoint (exposed to browser)

**Build:**
- `turbo.json` - Turbo build task configuration
- `tsconfig.json` files per workspace:
  - `apps/api/tsconfig.json` - ES2022 target, CommonJS, strict mode
  - `apps/web/tsconfig.json` - ES2017 target, ESM, Next.js plugins
  - `packages/*/tsconfig.json` - ES2022 target, CommonJS, strict mode

**Frontend Build:**
- `next.config.mjs` - API route rewrites (proxies `/api/*` to `NEXT_PUBLIC_API_URL`)
- `tailwind.config.ts` - Custom theme colors (CSS variables), animation keyframes
- `postcss.config.js` - PostCSS pipeline
- `.next/` directory (gitignored build output)

**Styling:**
- `apps/web/globals.css` - Global styles
- CSS Variables for theming (`--bg-base`, `--bg-surface`, `--accent-primary`, `--text-primary`, `--text-secondary`, `--text-muted`, `--success`, `--error`, `--warning`)

## Platform Requirements

**Development:**
- Node.js 20+
- Docker Desktop (for Redis)
- Chromium browser (installed via `npx playwright install chromium`)

**Production:**
- Docker containers (express API, worker process, Redis service defined in `docker-compose.yml`)
- Redis 7-alpine service
- Shared volume mount for screenshots: `/tmp/screenshots` (or `SCREENSHOT_PATH` env var)

---

*Stack analysis: 2026-03-12*
