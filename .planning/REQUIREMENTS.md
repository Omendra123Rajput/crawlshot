# Requirements: CrawlShot

**Defined:** 2026-03-12
**Core Value:** Every page on a site gets a pixel-perfect screenshot at both viewports, delivered as a clean ZIP download

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Pipeline

- [ ] **PIPE-01**: User can submit a URL and receive a job ID immediately
- [ ] **PIPE-02**: System crawls all internal pages from the submitted URL automatically
- [ ] **PIPE-03**: System discovers pages via sitemap.xml (primary) and link-following (fallback)
- [ ] **PIPE-04**: System respects robots.txt disallow rules during crawl
- [ ] **PIPE-05**: System deduplicates discovered URLs via normalization (trailing slash, query params, anchors)
- [ ] **PIPE-06**: System captures full-page screenshot at desktop viewport (1920x1080) for each page
- [ ] **PIPE-07**: System captures full-page screenshot at mobile viewport (390x844) for each page
- [ ] **PIPE-08**: System handles up to 500+ page sites without crashing or stalling

### Screenshot Quality

- [ ] **QUAL-01**: System scrolls page to bottom before capture to trigger lazy-loaded content
- [ ] **QUAL-02**: System waits for network idle + minimum 1500ms delay before capturing
- [ ] **QUAL-03**: System waits for all images to be fully loaded before capturing
- [ ] **QUAL-04**: System disables CSS animations and sets reduced motion preference for clean captures
- [ ] **QUAL-05**: System pauses video autoplay before capturing
- [ ] **QUAL-06**: System retries failed page captures up to 3 times with exponential backoff
- [ ] **QUAL-07**: A single page failure does not abort the entire job

### Output

- [ ] **OUTP-01**: User can download all screenshots as a ZIP file
- [ ] **OUTP-02**: ZIP files are organized by URL slug (e.g., `about/team/desktop.png`)
- [ ] **OUTP-03**: ZIP file size is capped to prevent OOM on large sites
- [ ] **OUTP-04**: User sees real-time progress via SSE (pages found, pages captured, current URL, failures)

### Security

- [ ] **SECR-01**: SSRF guard blocks private IPs, link-local, and cloud metadata endpoints on all outbound requests
- [ ] **SECR-02**: Path sanitization prevents directory traversal on all file writes
- [ ] **SECR-03**: All API request bodies validated with zod schemas
- [ ] **SECR-04**: Rate limiting on job creation endpoint

### Frontend

- [ ] **FRNT-01**: User can submit a URL via a form on the homepage
- [ ] **FRNT-02**: User sees real-time job progress on a dashboard page
- [ ] **FRNT-03**: User can download the completed ZIP from the dashboard
- [ ] **FRNT-04**: Frontend displays error states clearly when jobs fail

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Enhanced Quality

- **QUAL-08**: Configurable minimum delay via environment variable
- **QUAL-09**: CSS animation suppression configurable per-job
- **QUAL-10**: Upfront page count estimate from sitemap before crawl starts

### Deployment

- **DEPL-01**: Deployable to a cloud server (Railway, Render, or Fly.io)
- **DEPL-02**: Docker Compose production configuration

### Reliability

- **RELI-01**: Redis-backed job state persistence (survives API restart)
- **RELI-02**: Event-driven completion detection (replace polling interval)

## Out of Scope

| Feature | Reason |
|---------|--------|
| User authentication / multi-tenancy | Team tool, no login needed |
| Scheduled / recurring captures | One-time capture only, manual trigger sufficient |
| Visual diff / before-after comparison | Separate product category; team can use external diff tools |
| In-browser screenshot gallery | ZIP download is sufficient; keeps server stateless |
| Login-protected site support | All target sites are publicly accessible |
| Configurable viewport list | Two fixed viewports cover 99% of use cases |
| PDF report generation | ZIP with organized folders is more useful |
| Real-time screenshot preview in UI | Would saturate SSE connection; progress counts sufficient |
| Per-page custom wait conditions | Network idle + delay handles 95% of sites |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PIPE-01 | — | Pending |
| PIPE-02 | — | Pending |
| PIPE-03 | — | Pending |
| PIPE-04 | — | Pending |
| PIPE-05 | — | Pending |
| PIPE-06 | — | Pending |
| PIPE-07 | — | Pending |
| PIPE-08 | — | Pending |
| QUAL-01 | — | Pending |
| QUAL-02 | — | Pending |
| QUAL-03 | — | Pending |
| QUAL-04 | — | Pending |
| QUAL-05 | — | Pending |
| QUAL-06 | — | Pending |
| QUAL-07 | — | Pending |
| OUTP-01 | — | Pending |
| OUTP-02 | — | Pending |
| OUTP-03 | — | Pending |
| OUTP-04 | — | Pending |
| SECR-01 | — | Pending |
| SECR-02 | — | Pending |
| SECR-03 | — | Pending |
| SECR-04 | — | Pending |
| FRNT-01 | — | Pending |
| FRNT-02 | — | Pending |
| FRNT-03 | — | Pending |
| FRNT-04 | — | Pending |

**Coverage:**
- v1 requirements: 27 total
- Mapped to phases: 0
- Unmapped: 27 ⚠️

---
*Requirements defined: 2026-03-12*
*Last updated: 2026-03-12 after initial definition*
