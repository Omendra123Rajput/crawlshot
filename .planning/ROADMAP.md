# Roadmap: CrawlShot

## Overview

CrawlShot is a rebuild/fix project: the architecture is sound but the implementation is broken. The phases follow the natural repair sequence — first get the pipeline running end-to-end, then make captures pixel-perfect, then harden reliability, then polish the frontend experience, then validate at scale. Each phase delivers something verifiable before the next begins.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Pipeline Foundation** - API routes work, jobs are accepted, all internal pages are discovered and queued
- [ ] **Phase 2: Capture and Delivery** - Screenshots are captured at both viewports, packaged into a ZIP, and downloadable with real-time progress streaming
- [ ] **Phase 3: Screenshot Quality** - Captures are pixel-perfect: no mid-animation frames, no blank lazy-load placeholders, no autoplaying video, retries on failure
- [ ] **Phase 4: Frontend** - User-facing UI is polished, functional, and shows clear progress and error states
- [ ] **Phase 5: Scale and Reliability** - Pipeline handles 500+ page sites without crashing, stalling, or leaking resources

## Phase Details

### Phase 1: Pipeline Foundation
**Goal**: Users can submit a URL, get a job ID back immediately, and the system crawls all internal pages and queues screenshot jobs — with all security guards active
**Depends on**: Nothing (first phase)
**Requirements**: SECR-01, SECR-02, SECR-03, SECR-04, PIPE-01, PIPE-02, PIPE-03, PIPE-04, PIPE-05
**Success Criteria** (what must be TRUE):
  1. Submitting a URL to `POST /api/jobs` returns a job ID within one second, with no "Cannot GET /" or routing errors
  2. The crawl worker discovers all internal pages from the submitted URL, respects robots.txt, parses sitemap.xml, and deduplicates URLs before queuing screenshot jobs
  3. Private IP addresses, link-local addresses, and cloud metadata endpoints are blocked at the SSRF guard and never reached by Playwright or fetch
  4. All job creation payloads with missing or invalid fields are rejected with a descriptive error before any crawl begins
**Plans**: TBD

### Phase 2: Capture and Delivery
**Goal**: Users can watch a job run in real time and download a structured ZIP of full-page screenshots at both viewports when it completes
**Depends on**: Phase 1
**Requirements**: PIPE-06, PIPE-07, OUTP-01, OUTP-02, OUTP-03, OUTP-04
**Success Criteria** (what must be TRUE):
  1. Each discovered page produces two screenshot files: one at desktop (1920x1080) and one at mobile (390x844) viewport
  2. The completed ZIP is downloadable via `GET /api/jobs/:id/download` and contains files organized by URL slug (e.g., `about/team/desktop.png`)
  3. ZIP file size is capped and does not grow unboundedly on large crawls
  4. Real-time SSE progress events stream to any connected client, reporting pages found, pages captured, current URL, and failure count
**Plans**: TBD

### Phase 3: Screenshot Quality
**Goal**: Every captured screenshot reflects the true final visual state of the page — animations settled, lazy images loaded, videos frozen, no partial renders
**Depends on**: Phase 2
**Requirements**: QUAL-01, QUAL-02, QUAL-03, QUAL-04, QUAL-05, QUAL-06, QUAL-07
**Success Criteria** (what must be TRUE):
  1. Screenshots do not contain blank or partially loaded image placeholders — all images are fully decoded before capture
  2. No mid-animation frames appear in captures — CSS animations are disabled and reduced motion preference is set for every page context
  3. Video autoplay is frozen before capture, so screenshots show a static frame rather than an in-progress playback state
  4. A single page that times out or throws an error is retried up to 3 times and, if still failing, is logged and skipped without aborting the rest of the job
**Plans**: TBD

### Phase 4: Frontend
**Goal**: The UI clearly guides a user from URL submission through live progress to ZIP download, with unambiguous error feedback when anything goes wrong
**Depends on**: Phase 3
**Requirements**: FRNT-01, FRNT-02, FRNT-03, FRNT-04
**Success Criteria** (what must be TRUE):
  1. A user can paste a URL into the homepage form and submit it without any browser console errors or blank-screen rendering failures
  2. After submission, the dashboard page shows live progress: pages found, pages captured, and current URL updating in real time via SSE
  3. When the job completes, a download button appears on the dashboard and triggers the ZIP download when clicked
  4. When a job fails or a URL is rejected, the frontend displays a clear, human-readable error message rather than a spinner or blank state
**Plans**: TBD

### Phase 5: Scale and Reliability
**Goal**: The pipeline handles 500+ page sites end-to-end without running out of memory, stalling indefinitely, leaking browser processes, or accumulating dead Redis subscriptions
**Depends on**: Phase 4
**Requirements**: PIPE-08
**Success Criteria** (what must be TRUE):
  1. A site with 500+ pages completes successfully: all pages crawled, all screenshots captured, ZIP packaged and downloadable
  2. Memory usage stays within acceptable bounds throughout a 500+ page crawl — no OOM crashes or heap exhaustion
  3. All browser contexts and Redis Pub/Sub subscriptions are cleaned up after job completion, with no leaked processes visible after the job ends
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Pipeline Foundation | 0/TBD | Not started | - |
| 2. Capture and Delivery | 0/TBD | Not started | - |
| 3. Screenshot Quality | 0/TBD | Not started | - |
| 4. Frontend | 0/TBD | Not started | - |
| 5. Scale and Reliability | 0/TBD | Not started | - |
