# Stack Research

**Domain:** Website Screenshot Crawler SaaS (Node.js monorepo — rebuild/fix focus)
**Researched:** 2026-03-12
**Confidence:** HIGH (existing stack verified against current releases; Playwright specifics verified against official docs and GitHub issues)

---

## Context: This Is a Fix, Not a Greenfield Project

The monorepo structure is already in place. The research question is specifically:

> What techniques and library configuration make screenshot captures pixel-perfect on pages with animations, videos, and lazy-loaded content?

Research focuses on: (1) validating current library versions against what is current and stable, (2) identifying the correct Playwright configuration for production screenshot quality, and (3) flagging gaps in the existing implementation.

---

## Recommended Stack

### Core Technologies

| Technology | Current Version | Used Version | Purpose | Status |
|------------|----------------|--------------|---------|--------|
| Playwright | 1.58.2 | ^1.44.0 | Browser automation and full-page screenshots | Outdated — upgrade to ^1.58.0 |
| BullMQ | 5.70.4 | ^5.0.0 | Redis-backed job queues for crawl and screenshot tasks | Current (range covers latest) |
| ioredis | 5.10.0 | ^5.4.0 | Redis client for BullMQ and Pub/Sub | Current |
| Node.js | 20+ | 20+ | Runtime | Current |
| TypeScript | 5.4+ | ^5.4.0 | Type safety across monorepo | Current |
| Turborepo | 2.x | ^2.0.0 | Monorepo build orchestration | Current |

**Why upgrade Playwright:** 1.44 is 14 minor versions behind 1.58. Playwright's screenshot stability, lazy-load handling, and animation control have had significant fixes between these versions. GitHub issue #20859 ("Full Page Screenshots flaky, content cut off or shifted") was addressed in later versions.

### Supporting Libraries

| Library | Current Version | Used Version | Purpose | Notes |
|---------|----------------|--------------|---------|-------|
| p-limit | 7.3.0 | ^5.0.0 | Concurrency control per browser context | Existing version (5.x) works fine; 7.x is ESM-only, do not upgrade without ESM migration |
| node-html-parser | 6.1.x | ^6.1.0 | HTML parsing for link extraction | Current |
| fast-xml-parser | 5.3.7 | ^4.3.0 | Sitemap XML parsing | Consider upgrading to ^5.0.0 — v5 has same API as v4 with no breaking changes |
| archiver | 7.0.1 | ^7.0.0 | ZIP packaging of screenshots | Current |
| pino | 9.x | ^9.0.0 | Structured logging | Current |
| zod | 3.23+ | ^3.23.0 | Request body validation | Current |
| tsx | 4.x | ^4.0.0 | TypeScript execution for dev/worker | Current — correct choice over ts-node |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| tsx watch | TypeScript watch mode for API and worker | Faster than ts-node+nodemon; uses esbuild under the hood |
| Turborepo | Parallel dev/build across workspaces | `turbo run dev --parallel` starts all three services |
| npx playwright install chromium | Install Chromium browser binary | Must be re-run after Playwright version upgrades |

---

## The Critical Configuration: Playwright for Pixel-Perfect Screenshots

This is the core of the research. The existing `capture.ts` has the right structure but needs specific configuration changes.

### Problem 1: `networkidle` Is Discouraged for Production

The existing code uses `waitUntil: 'networkidle'` in `page.goto()`. Playwright's own documentation now marks `networkidle` as **DISCOURAGED** for production use. Modern sites with analytics polling, websockets, or background API calls never reach true network idle, causing hangs and timeouts.

**Correct production approach for screenshot services:**

```typescript
// Use 'load' for goto — fires when all resources (images, scripts) are loaded
await page.goto(url, {
  waitUntil: 'load',
  timeout: PAGE_LOAD_TIMEOUT_MS,
});
```

After `load`, follow with the scroll-trigger and a `waitForFunction` checking image completion (see Problem 3).

### Problem 2: Animations Are Not Being Disabled

The existing code calls `page.waitForTimeout(ANIMATION_SETTLE_MS)` (2 seconds) to wait for animations. This is unreliable — some animations are infinite (spinners, loaders, background effects). Waiting does not fix them; it just captures them mid-animation.

**Correct approach: two complementary techniques.**

**Technique A — Context-level `reducedMotion`:** Set during `browser.newContext()` to signal `prefers-reduced-motion: reduce` to CSS. Well-authored sites will stop animations in response to this.

```typescript
const context = await browser.newContext({
  viewport,
  userAgent: BROWSER_USER_AGENT,
  permissions: [],
  acceptDownloads: false,
  reducedMotion: 'reduce',           // ADD THIS
  javaScriptEnabled: true,
});
```

**Technique B — `animations: 'disabled'` in `page.screenshot()`:** This is a Playwright-native option that stops CSS animations, CSS transitions, and Web Animations at the screenshot moment. Finite animations are fast-forwarded to their end state (firing `transitionend`). Infinite animations are cancelled to their initial state.

```typescript
await page.screenshot({
  fullPage: true,
  path: outputPath,
  type: 'png',
  animations: 'disabled',     // ADD THIS — stops all CSS/Web animations
  scale: 'css',               // VERIFY THIS — 'css' = 1px per CSS px (keeps file sizes sane)
});
```

This replaces the 2-second `waitForTimeout` settle as the primary animation-freeze mechanism. Keep a shorter settle (500ms max) as a safety buffer for DOM mutations, not animation waiting.

### Problem 3: Lazy Images Are Not Verified as Loaded After Scrolling

The existing `scroll-trigger.ts` scrolls to trigger lazy loading, which is correct. But it does not wait for the triggered images to actually finish loading. The scroll fires the browser's IntersectionObserver callbacks, which start image network requests — but those requests may not be complete before the screenshot fires.

**Correct approach: `waitForFunction` after scrolling to verify all images are complete.**

```typescript
// After triggerLazyLoading(page):
await page.waitForFunction(() => {
  const images = Array.from(document.querySelectorAll('img'));
  return images.every(img => img.complete);
}, { timeout: 10_000 });
```

`img.complete` is true when an image has either successfully loaded or failed to load (no src, 404, etc.). This is safe — it will not hang on broken images.

### Problem 4: Video Autoplay Contaminates Screenshots

Pages with autoplaying videos will capture at a random frame. There is no Playwright-native "freeze video" option in `page.screenshot()`. The correct mitigation is injecting a script via `page.addInitScript()` that pauses all video elements and disables autoplay before the page loads.

```typescript
await page.addInitScript(() => {
  // Pause all videos before they can autoplay
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('video').forEach(v => {
      v.pause();
      v.removeAttribute('autoplay');
    });
  });
  // Also handle videos added dynamically
  const observer = new MutationObserver(() => {
    document.querySelectorAll('video').forEach(v => {
      if (!v.paused) v.pause();
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
});
```

`addInitScript` runs before the page's own scripts, so it catches autoplay before it starts.

### Problem 5: `screenshot({ scale: 'css' })` vs `'device'`

The existing code does not set `scale`. Playwright defaults to `'css'`, which is correct for this use case: 1 CSS pixel = 1 image pixel. Using `'device'` would double the resolution on retina screens and 4x the file sizes with no perceptible benefit for team use. Explicitly set `scale: 'css'` to make the intent clear and ensure it is not affected by context `deviceScaleFactor` settings.

### Complete Revised Capture Sequence

```
1. context = browser.newContext({ reducedMotion: 'reduce', ... })
2. page.addInitScript(videoFreezeScript)
3. page.goto(url, { waitUntil: 'load' })
4. page.waitForLoadState('domcontentloaded')     [belt-and-suspenders]
5. triggerLazyLoading(page)                      [scroll-trigger.ts]
6. waitForFunction(() => all images complete)
7. waitForTimeout(500)                           [short safety buffer for DOM mutations]
8. page.screenshot({ fullPage: true, animations: 'disabled', scale: 'css' })
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Playwright | Puppeteer | Never for new work — Playwright has broader browser support, better API, active development |
| Playwright | Headless Chrome via DevTools Protocol directly | Only if you need sub-millisecond control over CDP commands not exposed by Playwright |
| BullMQ | Bull (legacy) | Never — Bull is in maintenance mode; BullMQ is the active successor |
| BullMQ | Simple in-memory queue | Only for single-process, single-instance, no persistence requirements |
| ioredis | node-redis (`redis` package) | If you only need simple get/set and not BullMQ (BullMQ requires ioredis specifically) |
| node-html-parser | cheerio | Cheerio has 3x the weekly downloads and jQuery-like API; acceptable alternative, not worth migrating |
| tsx | ts-node | ts-node blocks execution on type errors during dev; tsx is faster for iteration |
| `waitUntil: 'load'` | `waitUntil: 'networkidle'` | Only if the site is known to not have background polling/analytics (i.e., static sites only) |
| `animations: 'disabled'` | `waitForTimeout(2000)` | Never — timeout-based settling does not stop infinite animations |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `waitUntil: 'networkidle'` | Marked DISCOURAGED in official Playwright docs; modern sites with analytics/polling never reach idle, causing hangs | `waitUntil: 'load'` + `waitForFunction` for specific conditions |
| `page.waitForTimeout(ANIMATION_SETTLE_MS)` as primary animation strategy | Does not stop infinite animations (spinners, loaders, background effects); just captures them at a random point 2s in | `page.screenshot({ animations: 'disabled' })` + short 500ms buffer |
| `scale: 'device'` in screenshot options | Produces 2x–4x larger PNG files with no meaningful quality benefit for documentation use; 1920x1080 desktop at device scale on a retina screen = 3840x2160 file | `scale: 'css'` (default, but set explicitly) |
| Bull (legacy) | Maintenance-only; no new features; BullMQ is the active replacement from the same author | BullMQ |
| Multiple browser instances per screenshot | The existing pool (10 browsers) has each browser handle one context. Creating a new browser per screenshot is expensive. New context per screenshot is correct and cheap. | One context per screenshot (existing approach), not one browser per screenshot |
| `p-limit` v6+ or v7+ without ESM migration | v6+ is ESM-only, incompatible with CommonJS TypeScript build without `"type": "module"` config changes | Stay on p-limit ^5.0.0 until ESM migration is planned |

---

## Stack Patterns by Variant

**If the page has a `#content-loaded` sentinel or similar indicator:**
- Use `page.waitForSelector('#content-loaded', { state: 'visible' })` instead of the generic image-complete `waitForFunction`
- Because explicit sentinels are more reliable than polling DOM state

**If capturing WordPress sites specifically (primary use case):**
- WordPress themes frequently use CSS animations on hero sections and page transitions
- `reducedMotion: 'reduce'` context option will trigger WordPress's built-in reduced-motion CSS (most themes support this)
- The `animations: 'disabled'` screenshot option catches anything that doesn't respect media queries

**If a page times out consistently:**
- Check if it has infinite scroll pagination — scroll-trigger may loop forever
- Add a max-height guard: `if (totalHeight >= Math.min(document.body.scrollHeight, 30000)) { resolve(); }`

**If screenshot file sizes are too large:**
- Switch `type: 'png'` to `type: 'jpeg'` with `quality: 85` for non-text-heavy pages
- PNG is correct default for pixel-perfect text rendering; JPEG is acceptable for photo-heavy pages

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| playwright ^1.58.0 | Node.js 18, 20, 22 | Upgrade from ^1.44.0 requires re-running `npx playwright install chromium` |
| bullmq ^5.x | ioredis ^5.x | BullMQ requires ioredis specifically; not compatible with the `redis` npm package |
| p-limit ^5.x | CommonJS + ESM | v5 supports both; v6+ is ESM-only |
| fast-xml-parser ^5.x | Same API as v4 | Safe upgrade, no breaking changes |
| tsx ^4.x | TypeScript ^5.x | tsx uses esbuild internally; full TS5 syntax support |
| archiver ^7.x | Node.js streams API | Stable; no version conflicts in this stack |

---

## Sources

- [Playwright release notes](https://playwright.dev/docs/release-notes) — verified current version 1.58.2 (MEDIUM confidence: from npm search result; official source confirms via release notes page)
- [Playwright browser.newContext() API](https://playwright.dev/docs/api/class-browser#browser-new-context) — `reducedMotion` option confirmed (HIGH)
- [Playwright page.screenshot() `animations: 'disabled'`](https://playwright.dev/docs/api/class-page) — confirmed via official docs and GitHub issue #11912 (HIGH)
- [Playwright screenshot scale option](https://playwright.dev/docs/screenshots) — `'css'` vs `'device'` confirmed (HIGH)
- [Playwright GitHub issue #19861](https://github.com/microsoft/playwright/issues/19861) — lazy load + fullPage screenshot problem confirmed (HIGH)
- [Playwright GitHub issue #20859](https://github.com/microsoft/playwright/issues/20859) — fullPage screenshot flakiness confirmed (HIGH)
- [BullMQ npm](https://www.npmjs.com/package/bullmq) — current version 5.70.4 confirmed (HIGH)
- [ioredis npm](https://www.npmjs.com/package/ioredis) — current version 5.10.0 confirmed (HIGH)
- [p-limit npm](https://www.npmjs.com/package/p-limit) — v7.3.0 current, v5.x last CJS-compatible (HIGH)
- [fast-xml-parser npm](https://www.npmjs.com/package/fast-xml-parser) — v5.3.7 current, API-compatible with v4 (HIGH)
- [Playwright `networkidle` discouraged](https://www.browserstack.com/guide/playwright-waitforloadstate) — consistent with official Playwright docs wording (MEDIUM)
- [TSX vs ts-node comparison](https://betterstack.com/community/guides/scaling-nodejs/tsx-vs-ts-node/) — tsx recommended for dev loop speed (MEDIUM)

---

*Stack research for: CrawlShot — Website Screenshot Crawler (rebuild/fix milestone)*
*Researched: 2026-03-12*
