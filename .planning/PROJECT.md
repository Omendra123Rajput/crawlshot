# CrawlShot

## What This Is

A team tool for capturing pixel-perfect full-page screenshots of every page on a website, at both desktop (1920x1080) and mobile (390x844) viewports. Paste a URL, the app crawls all internal pages (up to 10k), waits for each page to fully load (animations settled, lazy content loaded), captures screenshots, and packages them into a downloadable ZIP. Built for teams maintaining WordPress and custom sites.

## Core Value

Every page on a site gets a pixel-perfect screenshot at both viewports, delivered as a clean ZIP download — no missed pages, no half-loaded captures.

## Requirements

### Validated

- ✓ Monorepo structure with shared packages (crawler, screenshot-engine, queue, storage, utils) — existing
- ✓ Link discovery with robots.txt/sitemap.xml parsing — existing
- ✓ SSRF guard blocking private IPs and cloud metadata — existing
- ✓ Browser pool with Playwright for concurrent captures — existing
- ✓ BullMQ job queues for crawl and screenshot tasks — existing
- ✓ Redis Pub/Sub for real-time progress events — existing
- ✓ SSE streaming from API to frontend — existing
- ✓ ZIP packaging with size cap — existing
- ✓ Path sanitization on all file writes — existing
- ✓ Rate limiting and request validation — existing

### Active

- [ ] Working end-to-end flow locally (submit URL → crawl → screenshot → download ZIP)
- [ ] Pixel-perfect screenshots with proper page load detection (network idle + minimum delay)
- [ ] Handle pages with animations, videos, and lazy-loaded content before capturing
- [ ] Desktop (1920x1080) and Mobile (390x844) viewport captures
- [ ] Dark-themed frontend UI with real-time progress
- [ ] Support for large sites (500+ pages)
- [ ] Security hardened (HTTPS-only URLs, input validation, no auth needed for team use)

### Out of Scope

- User authentication / multi-tenancy — team tool, no login needed
- Scheduled/recurring captures — one-time capture only
- Visual diff/comparison — just screenshots, no before/after
- PDF report generation — ZIP download is sufficient
- Login-protected site support — all sites are publicly accessible
- Cloud deployment — get working locally first, deployment planned later

## Context

- Existing codebase has the architecture in place but is currently broken (API returns "Cannot GET /", frontend has rendering errors)
- This is a rebuild/rethink — fix what's broken, ensure the pipeline actually works end-to-end
- Team uses this for WordPress and custom site maintenance — capturing visual state of client sites
- Sites can be large (500+ pages), so crawling and screenshot pipeline must be robust
- Screenshots must wait for: network idle AND a minimum safety delay to ensure animations/videos have settled
- Target: working locally first, deployment considerations deferred

## Constraints

- **Runtime**: Node.js 20+, Playwright Chromium for screenshots
- **Infrastructure**: Redis required for BullMQ queues and Pub/Sub
- **Stack**: TypeScript monorepo with Turborepo, Next.js 14 frontend, Express API, BullMQ workers
- **Security**: SSRF guard mandatory before any URL fetch, path sanitization on all file writes
- **Performance**: Must handle 500+ page sites without crashing or stalling

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Rebuild existing codebase rather than start fresh | Architecture is sound, implementation has bugs | — Pending |
| Network idle + minimum delay for page readiness | Pages with animations/videos need both smart detection and a safety buffer | — Pending |
| No authentication | Team-only tool, simplicity over access control | — Pending |
| ZIP download only (no dashboard browsing) | Simplest output format, meets team needs | — Pending |

---
*Last updated: 2026-03-12 after initialization*
