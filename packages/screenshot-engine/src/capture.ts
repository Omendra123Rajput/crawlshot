import fs from 'fs/promises';
import path from 'path';
import { getBrowserPool } from './browser-pool';
import { triggerLazyLoading } from './scroll-trigger';
import { sanitizeFilename, safePath } from './sanitize-path';
import { guardUrl } from '@screenshot-crawler/crawler';
import {
  logger,
  VIEWPORTS,
  BROWSER_USER_AGENT,
  PAGE_LOAD_TIMEOUT_MS,
  CAPTURE_HARD_TIMEOUT_MS,
  type ViewportKey,
} from '@screenshot-crawler/utils';

export class PageCaptureError extends Error {
  public readonly url: string;
  public readonly viewport: string;

  constructor(url: string, viewport: string, cause: Error) {
    super(`Failed to capture ${url} at ${viewport}: ${cause.message}`);
    this.name = 'PageCaptureError';
    this.url = url;
    this.viewport = viewport;
    this.cause = cause;
  }
}

// 1x1 transparent PNG placeholder
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64'
);

export async function capturePage(
  url: string,
  viewport: ViewportKey,
  outputDir: string
): Promise<string> {
  const viewportConfig = VIEWPORTS[viewport];
  const filename = sanitizeFilename(url);
  const outputPath = safePath(outputDir, viewport, filename);

  // Ensure output directory exists
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  try {
    // No internal retry — let BullMQ handle retries at the job level
    await captureWithTimeout(url, viewportConfig, outputPath);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(
      { url, viewport, error: err.message },
      'Screenshot capture failed, saving placeholder'
    );

    // Save placeholder PNG so the pipeline can continue
    await fs.writeFile(outputPath, PLACEHOLDER_PNG);
  }

  return outputPath;
}

async function captureWithTimeout(
  url: string,
  viewport: { width: number; height: number },
  outputPath: string
): Promise<void> {
  const pool = getBrowserPool();
  const browser = pool.getBrowser();

  const context = await browser.newContext({
    viewport,
    userAgent: BROWSER_USER_AGENT,
    permissions: [],
    geolocation: undefined,
    javaScriptEnabled: true,
    acceptDownloads: false,
  });

  try {
    const page = await context.newPage();

    // Hard timeout for the entire capture
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Capture hard timeout exceeded')), CAPTURE_HARD_TIMEOUT_MS);
    });

    await Promise.race([
      (async () => {
        // 1. Re-validate URL before navigation (TOCTOU DNS rebinding defense)
        await guardUrl(url);

        // 2. Navigate and wait for initial load
        await page.goto(url, {
          waitUntil: 'load',
          timeout: PAGE_LOAD_TIMEOUT_MS,
        });

        // 2. Wait for network to settle (short timeout — don't block on slow resources)
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

        // 3. Wait for fonts to finish loading
        await page.evaluate(() => document.fonts.ready).catch(() => {});

        // 4. Dismiss cookie banners / consent dialogs
        await dismissCookieBanners(page);

        // 5. Brief settle — let page JS initialize
        await page.waitForTimeout(500);

        // 6. Scroll through entire page to trigger lazy loading + animations
        await triggerLazyLoading(page);

        // 7. Short wait for network after lazy loads (don't block long)
        await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});

        // 8. Final settle for animations (reduced)
        await page.waitForTimeout(1000);

        // 9. Force all elements to their visible/final state
        await page.addStyleTag({
          content: `
            *, *::before, *::after {
              transition-duration: 0s !important;
              transition-delay: 0s !important;
              animation-duration: 0s !important;
              animation-delay: 0s !important;
              animation-play-state: paused !important;
              animation-fill-mode: forwards !important;
            }
            [class*="animate"], [class*="fade"], [class*="slide"],
            [class*="reveal"], [class*="show"], [class*="visible"],
            [class*="appear"], [class*="aos-"], [class*="wow"],
            [class*="scroll"], [class*="inview"], [class*="motion"],
            [data-aos], [data-wow-delay], [data-scroll] {
              opacity: 1 !important;
              transform: none !important;
              visibility: visible !important;
              clip-path: none !important;
            }
            .is-hidden, .not-visible, .before-animate {
              opacity: 1 !important;
              transform: none !important;
              visibility: visible !important;
            }
          `
        });

        // 10. Force opacity/transform on elements that might be hidden
        await page.evaluate(() => {
          const all = document.querySelectorAll('*');
          for (const el of all) {
            const style = window.getComputedStyle(el);
            const opacity = parseFloat(style.opacity);
            if (opacity < 0.1 && el.getBoundingClientRect().height > 10) {
              (el as HTMLElement).style.setProperty('opacity', '1', 'important');
            }
            if (style.transform !== 'none' && style.transform.includes('translate')) {
              const rect = el.getBoundingClientRect();
              if (rect.top > window.innerHeight * 3 || rect.left > window.innerWidth * 2) {
                (el as HTMLElement).style.setProperty('transform', 'none', 'important');
              }
            }
          }
        });

        // 11. Brief wait for style recalculation
        await page.waitForTimeout(300);

        // 12. Scroll to top
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(200);

        // 13. Capture full-page screenshot
        await page.screenshot({
          fullPage: true,
          path: outputPath,
          type: 'png',
        });
      })(),
      timeoutPromise,
    ]);
  } finally {
    await context.close();
  }
}

/**
 * Attempt to dismiss cookie consent banners by:
 * 1. Clicking common accept/close buttons (fast check)
 * 2. Hiding remaining banner elements via CSS
 */
async function dismissCookieBanners(page: import('playwright').Page): Promise<void> {
  try {
    // Try clicking common cookie accept buttons (ordered by specificity)
    const acceptSelectors = [
      '#onetrust-accept-btn-handler',
      '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
      '#CybotCookiebotDialogBodyButtonAccept',
      '[data-cookiefirst-action="accept"]',
      '.cc-btn.cc-dismiss',
      '.cc-btn.cc-allow',
      '#gdpr-cookie-accept',
      '.js-cookie-consent-agree',
      'button[id*="cookie" i][id*="accept" i]',
      'button[class*="cookie" i][class*="accept" i]',
      'button[class*="consent" i][class*="accept" i]',
    ];

    for (const selector of acceptSelectors) {
      try {
        const btn = page.locator(selector).first();
        if (await btn.isVisible({ timeout: 100 })) {
          await btn.click({ timeout: 500 });
          await page.waitForTimeout(300);
          return;
        }
      } catch {
        // Selector not found or not clickable, try next
      }
    }

    // Fallback: try to find and click buttons by visible text content
    const textPatterns = [
      'Accept All',
      'Accept all cookies',
      'Accept Cookies',
      'Allow All',
      'I Accept',
      'I Agree',
      'Got it',
      'Accept',
    ];

    for (const text of textPatterns) {
      try {
        const btn = page.locator(`button:has-text("${text}"), a:has-text("${text}")`).first();
        if (await btn.isVisible({ timeout: 100 })) {
          await btn.click({ timeout: 500 });
          await page.waitForTimeout(300);
          return;
        }
      } catch {
        // Not found, try next
      }
    }

    // Final fallback: hide all cookie-related overlays via CSS
    await page.addStyleTag({
      content: `
        #onetrust-banner-sdk,
        #onetrust-consent-sdk,
        #CybotCookiebotDialog,
        #cookie-law-info-bar,
        .cc-window,
        .cookie-consent,
        .cookie-banner,
        .cookie-notice,
        .gdpr-banner,
        .consent-banner,
        [class*="cookie-banner" i],
        [class*="cookie-consent" i],
        [class*="cookie-notice" i],
        [class*="cookie-popup" i],
        [class*="cookieBanner" i],
        [class*="cookieConsent" i],
        [id*="cookie-banner" i],
        [id*="cookie-consent" i],
        [id*="cookie-notice" i],
        [id*="cookieBanner" i],
        [id*="gdpr" i],
        [aria-label*="cookie" i][role="dialog"],
        [aria-label*="consent" i][role="dialog"] {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
        .onetrust-pc-dark-filter,
        .cky-overlay,
        [class*="cookie" i][class*="overlay" i],
        [class*="consent" i][class*="overlay" i] {
          display: none !important;
        }
      `
    });
  } catch (error) {
    // Non-critical — don't fail the screenshot over cookie banners
    logger.debug({ error: String(error) }, 'Cookie banner dismissal failed (non-critical)');
  }
}
