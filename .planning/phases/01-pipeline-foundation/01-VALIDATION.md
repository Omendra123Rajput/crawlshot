---
phase: 1
slug: pipeline-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (to be installed in Wave 0) |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run packages/crawler/src/ --reporter=dot`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 0 | SECR-01 | unit | `npx vitest run packages/crawler/src/ssrf-guard.test.ts` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 0 | SECR-02 | unit | `npx vitest run packages/screenshot-engine/src/sanitize-path.test.ts` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 0 | SECR-03 | unit | `npx vitest run apps/api/src/routes/jobs.test.ts` | ❌ W0 | ⬜ pending |
| 1-01-04 | 01 | 0 | PIPE-04 | unit | `npx vitest run packages/crawler/src/robots-parser.test.ts` | ❌ W0 | ⬜ pending |
| 1-01-05 | 01 | 0 | PIPE-05 | unit | `npx vitest run packages/crawler/src/url-normalizer.test.ts` | ❌ W0 | ⬜ pending |
| 1-02-01 | 02 | 1 | SECR-01 | unit | `npx vitest run packages/crawler/src/ssrf-guard.test.ts` | ❌ W0 | ⬜ pending |
| 1-02-02 | 02 | 1 | PIPE-02 | unit | `npx vitest run packages/crawler/src/index.test.ts` | ❌ W0 | ⬜ pending |
| 1-02-03 | 02 | 1 | PIPE-05 | unit | `npx vitest run packages/crawler/src/url-normalizer.test.ts` | ❌ W0 | ⬜ pending |
| 1-03-01 | 03 | 1 | PIPE-01 | integration | `npx vitest run apps/api/src/routes/jobs.test.ts` | ❌ W0 | ⬜ pending |
| 1-03-02 | 03 | 1 | PIPE-03 | unit | `npx vitest run packages/crawler/src/sitemap-parser.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `npm install -D vitest` — install test framework in root
- [ ] `packages/crawler/src/ssrf-guard.test.ts` — stubs for SECR-01 (private IPv4, IPv6, link-local, cloud metadata, HTTPS enforce, valid public pass)
- [ ] `packages/screenshot-engine/src/sanitize-path.test.ts` — stubs for SECR-02 (traversal rejection)
- [ ] `apps/api/src/routes/jobs.test.ts` — stubs for SECR-03, SECR-04, PIPE-01 (validation, rate limit config, job creation)
- [ ] `packages/crawler/src/robots-parser.test.ts` — stubs for PIPE-04 (disallow, allow, wildcard)
- [ ] `packages/crawler/src/url-normalizer.test.ts` — stubs for PIPE-05 (fragment strip, query sort, trailing slash, HTTP reject)
- [ ] `packages/crawler/src/sitemap-parser.test.ts` — stubs for PIPE-03 (urlset parsing)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end crawl of a real site | PIPE-02, PIPE-03 | Requires live URL and Redis | Start all services, POST a real URL, verify crawl completes |
| SSE progress streaming | PIPE-01 | Requires running API + worker | Submit job, connect to SSE endpoint, verify events arrive |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
