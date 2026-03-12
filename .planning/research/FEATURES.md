# Feature Research

**Domain:** Website Screenshot Crawler (bulk, full-site, team tool)
**Researched:** 2026-03-12
**Confidence:** HIGH (table stakes from competitor analysis + official docs) / MEDIUM (differentiators from market research)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels broken or unfinished.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Full-page screenshot capture | Any screenshot tool must capture the complete page, not just the visible viewport | LOW | Playwright `fullPage: true` handles this natively; the challenge is ensuring content is actually loaded before capture |
| Multiple viewport support (desktop + mobile) | Sites look different at different sizes — capturing one viewport is incomplete for QA/maintenance work | LOW | Two fixed viewports (1920x1080 desktop, 390x844 mobile) is the right scope; avoid open-ended viewport configuration |
| Crawl all internal links from a root URL | Tool must discover pages automatically — manually listing URLs defeats the purpose | MEDIUM | Must handle relative links, anchor deduplication, URL normalization, and respect domain boundaries |
| Real-time progress feedback | Crawling 500+ pages takes minutes; users need to know the job is running and how far along it is | MEDIUM | SSE is the right transport — unidirectional push from server, works over HTTP without WebSocket handshake complexity |
| ZIP download of all screenshots | Users need to take the output somewhere — streaming individual images is too cumbersome | MEDIUM | ZIP must be size-capped to prevent OOM issues on large sites; archiver with streaming write (not full-in-memory) |
| Lazy-loaded content handling | Most modern sites use lazy loading for images and iframes — screenshots without scroll-triggering show blank sections | MEDIUM | Must scroll page to bottom before capture to trigger all lazy-load events; add minimum delay after scroll |
| Correct page load detection | Capturing too early yields half-loaded pages with spinners or missing content | MEDIUM | The right strategy is `networkidle` + minimum floor delay (e.g., 1500ms), NOT `networkidle` alone — SPAs with polling calls never reach true idle |
| robots.txt + sitemap.xml parsing | Respects the site's declared structure; sitemap provides a faster/more complete page list than link-following alone | MEDIUM | Sitemap discovery gives immediate full URL set; robots.txt blocking prevents crawling restricted sections |
| Error handling and per-page retry | Any page can timeout or return an error — the whole job should not fail because of one bad page | MEDIUM | 3 retries with exponential backoff for transient failures (timeout, 5xx); do NOT retry 404s or auth-walls |
| Deduplication of discovered URLs | Without dedup, the same page gets screenshotted multiple times (e.g., `/about` and `/about/`) | LOW | URL normalization (trailing slash, query string stripping) must happen before enqueue |
| SSRF protection | Team tools that accept URLs are prime SSRF targets — any crawl against a private IP is a security hole | LOW | Block private ranges, link-local, loopback, and cloud metadata endpoints (169.254.169.254) before any fetch |

### Differentiators (Competitive Advantage)

Features that set this product apart from generic screenshot APIs and single-URL tools.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Crawl-first architecture with job queue isolation | Separates discovery from capture — crawl job produces page list, screenshot jobs run in parallel pool; this is why the tool scales where competitors stall | HIGH | BullMQ with separate `crawl` (concurrency 5) and `screenshot` (concurrency 10) queues is the right design; do not merge these into one job type |
| Organized ZIP structure (page slug as filename) | Screenshots are useless if you can't identify which file = which page; organized output saves the user from renaming 500 files | MEDIUM | File naming strategy: sanitize URL path → use as directory structure (`/about/team` → `about/team/desktop.png`); path traversal guard required |
| Minimum delay safety buffer on top of networkidle | CSS animations, video autoplay, and scroll-triggered transitions don't register as network traffic — a fixed floor delay catches these | LOW | 1500–2000ms after networkidle is the pragmatic sweet spot; configurable via env var is sufficient, no UI needed |
| Accurate page count from sitemap before crawl starts | Users with large sites want to know upfront how many pages will be captured | MEDIUM | Parse sitemap.xml first → report page count before starting; fallback to link discovery when no sitemap |
| Per-job progress streaming with page-level granularity | "X of Y pages complete" is more useful than a spinner; lets users estimate completion time | MEDIUM | Progress events via Redis Pub/Sub → SSE to frontend; events should carry `{ completed, total, currentUrl, failed }` |
| Graceful handling of animation and video elements | Videos with autoplay, carousels, and animated hero sections are common on agency/WordPress sites; handling them correctly is the core quality bar | HIGH | Scroll-to-bottom + settle delay + optionally disable CSS animations via injected style; `prefers-reduced-motion` injection is a clean technique |
| Robots.txt SSRF guard integration | Most tools either skip robots.txt or process it without security consideration; combining both is a quality signal | MEDIUM | Resolve robots.txt URL through SSRF guard before fetching — the guard applies to ALL outbound requests, not just page URLs |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem useful but create significant complexity, scope creep, or violate the product's focus.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| User authentication / multi-tenancy | "What if multiple teams use it?" | Auth adds login flows, session management, credential storage, and permission models — none of which are needed for a single-team tool | Ship with no auth; restrict via network (VPN, local-only) if needed |
| Scheduled / recurring captures | "I want to capture this site every week" | Scheduling requires persistent job storage, cron infrastructure, and notification delivery — doubles the surface area of the system | One-time capture only; users can trigger manually when needed |
| Visual diff / before-after comparison | "Can it show what changed?" | Diffing requires storing previous runs, image comparison algorithms, and a review UI — this is a separate product category | Produce clean screenshots; let the team use external diff tools (e.g., BackstopJS, Percy) |
| In-browser screenshot gallery / viewer | "I want to browse screenshots in the app" | Serving thousands of images through the app creates storage, CDN, and UI complexity; the ZIP is sufficient for a team tool | ZIP download → open locally; keep the server stateless |
| Login-protected site support | "We have client sites behind auth" | Credential management, session handling, cookie injection, and 2FA — each adds substantial attack surface and complexity | Out of scope for v1; authenticated crawl is a separate feature with its own security model |
| Configurable viewport list | "Let me add custom resolutions" | Viewport configuration adds UI, validation, and combinatorial screenshot volume (5 viewports × 500 pages = 2500 screenshots) | Two fixed viewports (desktop + mobile) cover 99% of the team's actual use case |
| PDF report generation | "Can I get a PDF with all screenshots?" | Multi-page PDFs from screenshots are large, slow to generate, and hard to navigate; ZIP with organized folders is more useful | ZIP download with slug-based filenames; each file is immediately usable |
| Real-time screenshot preview in UI | "Show me each screenshot as it's taken" | Streaming large image payloads through SSE would saturate the connection; preview adds complexity without adding to the core value | Show progress counts and current URL being captured; deliver everything in the final ZIP |
| Per-page custom wait conditions | "Wait for this CSS selector before capturing" | Selector-based waits require per-URL configuration, a UI to set them, and debugging when selectors change | Use networkidle + fixed delay; this handles 95% of sites without per-page configuration |

## Feature Dependencies

```
[URL Submission]
    └──requires──> [SSRF Guard]
                       └──requires──> [DNS Resolution / IP range check]

[Crawl Job]
    └──requires──> [robots.txt parsing]
    └──requires──> [sitemap.xml parsing]
    └──requires──> [Link discovery / deduplication]
    └──produces──> [Screenshot Job Queue]

[Screenshot Job]
    └──requires──> [Browser pool (Playwright)]
    └──requires──> [Lazy-load scroll trigger]
    └──requires──> [Page load detection (networkidle + delay)]
    └──requires──> [Path sanitization]
    └──produces──> [Screenshot file on disk]

[Progress Streaming]
    └──requires──> [Redis Pub/Sub]
    └──requires──> [SSE endpoint on API]
    └──requires──> [Job exists in queue]

[ZIP Download]
    └──requires──> [All screenshot files written]
    └──requires──> [archiver with size cap]
    └──requires──> [Organized file naming (slug-based paths)]

[ZIP Download] ──enhances──> [Organized file naming]
[Lazy-load scroll] ──enhances──> [Page load detection]
[sitemap.xml parsing] ──enhances──> [Crawl Job] (faster, more complete URL list)
[SSRF Guard] ──conflicts──> [Login-protected site support] (credential injection must bypass guard)
```

### Dependency Notes

- **Screenshot Job requires Page load detection:** The scroll-trigger for lazy loading must complete before the networkidle wait begins — not in parallel.
- **ZIP Download requires organized naming:** Without slug-based paths the ZIP is unusable (500 files named `screenshot-1.png` through `screenshot-1000.png`).
- **sitemap.xml enhances Crawl Job:** When a sitemap exists, use it as the primary URL source and skip link-following for those URLs; link-following is the fallback, not the primary strategy.
- **SSRF Guard conflicts with login-protected support:** Cookie injection and session management require outbound requests that the SSRF guard would need to selectively allow — this creates a guard bypass surface that is not worth opening.

## MVP Definition

### Launch With (v1) — This Milestone

The existing codebase has the architecture. The goal is a working end-to-end pipeline.

- [ ] **SSRF guard on all outbound requests** — security prerequisite for everything else; cannot ship without it
- [ ] **Crawl all internal links from a root URL** — with robots.txt + sitemap.xml support, URL normalization, deduplication
- [ ] **Lazy-load scroll before capture** — scroll to bottom, wait for images/iframes to load
- [ ] **networkidle + minimum 1500ms delay** — correct page readiness detection that handles animations and SPAs
- [ ] **Desktop (1920x1080) and Mobile (390x844) captures** — both viewports per page
- [ ] **Slug-based ZIP output with path sanitization** — organized, usable file structure
- [ ] **Real-time progress via SSE** — page count, current URL, failed count streamed to frontend
- [ ] **Per-page retry (3 attempts, exponential backoff)** — transient failures don't abort the whole job
- [ ] **ZIP size cap** — prevents OOM on very large sites

### Add After Validation (v1.x)

Features to add once the core pipeline is confirmed working reliably.

- [ ] **Accurate upfront page count** — parse sitemap first, report total before crawl starts; requires sitemap to be reliable
- [ ] **Configurable minimum delay via env var** — let the operator tune the safety buffer without a code change
- [ ] **CSS animation suppression** — inject `* { animation: none !important; transition: none !important; }` for sites where animations cause inconsistent screenshots

### Future Consideration (v2+)

Defer until the team has validated the core tool is reliable for their workflow.

- [ ] **Authenticated site support** — only if the team has client sites behind login that they need to capture
- [ ] **Scheduled captures** — only if manual triggering becomes a pain point
- [ ] **Visual diffing** — only if the team's actual workflow requires before/after comparison

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Working end-to-end pipeline (submit → ZIP) | HIGH | HIGH | P1 |
| Correct page load detection (networkidle + delay) | HIGH | MEDIUM | P1 |
| Lazy-load scroll trigger | HIGH | LOW | P1 |
| Slug-based ZIP with organized structure | HIGH | LOW | P1 |
| Real-time SSE progress streaming | HIGH | MEDIUM | P1 |
| Per-page retry with backoff | HIGH | LOW | P1 |
| SSRF guard on all fetches | HIGH | LOW | P1 |
| robots.txt + sitemap.xml parsing | MEDIUM | MEDIUM | P2 |
| Upfront page count from sitemap | MEDIUM | LOW | P2 |
| ZIP size cap | MEDIUM | LOW | P2 |
| CSS animation suppression | LOW | LOW | P2 |
| Configurable delay via env var | LOW | LOW | P2 |
| Login-protected site support | LOW | HIGH | P3 |
| Scheduled recurring captures | LOW | HIGH | P3 |
| Visual diffing | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for this milestone to succeed
- P2: Should have, add when core is stable
- P3: Nice to have, future consideration only

## Competitor Feature Analysis

| Feature | Generic Screenshot APIs (ScreenshotOne, Urlbox) | Bulk URL Tools (URL Profiler, Botster) | CrawlShot (this project) |
|---------|--------------|--------------|--------------|
| Auto-crawl all internal pages | No — single URL at a time | No — user provides URL list | Yes — link discovery + sitemap |
| robots.txt + sitemap.xml | Partial (robots.txt respect only) | No | Yes — both, sitemap-first |
| Lazy-load handling | Yes (paid tiers) | Varies | Yes — scroll-to-bottom + delay |
| Real-time progress | No | No | Yes — SSE streaming |
| Organized ZIP output | No | ZIP export only (flat) | Yes — slug-based directory structure |
| Multiple viewports | Yes (configurable) | Yes (limited presets) | Yes — desktop + mobile fixed |
| Per-page retry | Yes | Varies | Yes — BullMQ with backoff |
| SSRF protection | Implicit (cloud-hosted) | No | Yes — explicit guard |
| No auth required | N/A (API key required) | N/A (SaaS account) | Yes — team-local, no login |

**Key gap CrawlShot fills:** No competitor combines automatic full-site crawling, organized ZIP output, and real-time progress in a self-hosted, no-auth tool. Generic APIs are per-URL and require API keys; bulk tools need URL lists upfront and produce flat output.

## Sources

- [Screenshot API Comparison 2026 — DEV Community](https://dev.to/dennis-ddev/screenshot-api-comparison-2026-snaprender-vs-screenshotone-vs-urlbox-vs-scrapingbee-vs-capturekit-3egh)
- [Full Page Screenshot Guide — ScreenshotOne](https://screenshotone.com/blog/a-complete-guide-on-how-to-take-full-page-screenshots-with-puppeteer-playwright-or-selenium/)
- [Playwright waitForLoadState — BrowserStack](https://www.browserstack.com/guide/playwright-waitforloadstate)
- [Shotomatic Website Crawler Features](https://www.shotomatic.com/changelog/website-crawler)
- [Bulk Screenshots with Puppeteer — ScreenshotOne](https://screenshotone.com/blog/bulk-screenshots-with-puppeteer/)
- [Crawlee Error Handling](https://crawlee.dev/python/docs/guides/error-handling)
- [Screenshot API Comparison 2025 — DEV Community](https://dev.to/mukul_sharma/choosing-the-best-screenshot-api-in-2025-a-developers-guide-79)
- [Urlbox CaptureDeck Bulk Screenshot Service](https://urlbox.com/products/capturedeck)

---
*Feature research for: Website Screenshot Crawler (SaaS team tool)*
*Researched: 2026-03-12*
