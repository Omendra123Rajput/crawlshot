import fs from 'fs/promises';
import path from 'path';
import { getBrowserPool } from './browser-pool';
import { triggerLazyLoading } from './scroll-trigger';
import { sanitizeFilename, safePath } from './sanitize-path';
import {
  logger,
  retry,
  VIEWPORTS,
  BROWSER_USER_AGENT,
  PAGE_LOAD_TIMEOUT_MS,
  CAPTURE_HARD_TIMEOUT_MS,
  ANIMATION_SETTLE_MS,
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
    await retry(async () => {
      await captureWithTimeout(url, viewportConfig, outputPath);
    }, 2, 3000);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(
      { url, viewport, error: err.message },
      'Screenshot capture failed after retries, saving placeholder'
    );

    // Save placeholder PNG
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
        // 1. Navigate and wait for initial load
        await page.goto(url, {
          waitUntil: 'load',
          timeout: PAGE_LOAD_TIMEOUT_MS,
        });

        // 2. Wait for network to settle
        await page.waitForLoadState('networkidle').catch(() => {});

        // 3. Wait for fonts to finish loading
        await page.evaluate(() => document.fonts.ready).catch(() => {});

        // 4. Initial settle — let page JS initialize
        await page.waitForTimeout(1500);

        // 5. Scroll through entire page to trigger lazy loading + animations
        await triggerLazyLoading(page);

        // 6. Wait for network to settle after lazy loads
        await page.waitForLoadState('networkidle').catch(() => {});

        // 7. Final settle for animations
        await page.waitForTimeout(ANIMATION_SETTLE_MS);

        // 8. CRITICAL: Force all elements to their visible/final state.
        //    Many sites use IntersectionObserver to add/remove CSS classes
        //    that control opacity/transform animations. When Playwright
        //    takes a fullPage screenshot from the top, off-screen elements
        //    revert to invisible. This CSS override forces everything visible.
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
            /* Force common animation library classes to their final state */
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
            /* Override common initial hidden states */
            .is-hidden, .not-visible, .before-animate {
              opacity: 1 !important;
              transform: none !important;
              visibility: visible !important;
            }
          `
        });

        // 9. Also force opacity/transform on ALL elements that might be hidden
        await page.evaluate(() => {
          const all = document.querySelectorAll('*');
          for (const el of all) {
            const style = window.getComputedStyle(el);
            const opacity = parseFloat(style.opacity);
            // If element has low opacity and isn't meant to be a subtle overlay
            if (opacity < 0.1 && el.getBoundingClientRect().height > 10) {
              (el as HTMLElement).style.setProperty('opacity', '1', 'important');
            }
            // Fix elements with transform that pushes them off-screen
            if (style.transform !== 'none' && style.transform.includes('translate')) {
              const rect = el.getBoundingClientRect();
              if (rect.top > window.innerHeight * 3 || rect.left > window.innerWidth * 2) {
                (el as HTMLElement).style.setProperty('transform', 'none', 'important');
              }
            }
          }
        });

        // 10. Brief wait for style recalculation
        await page.waitForTimeout(500);

        // 11. Scroll to top
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(300);

        // 12. Capture full-page screenshot
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
