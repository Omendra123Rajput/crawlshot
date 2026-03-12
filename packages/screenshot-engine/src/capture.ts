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
        // 1. Navigate
        await page.goto(url, {
          waitUntil: 'networkidle',
          timeout: PAGE_LOAD_TIMEOUT_MS,
        });

        // 2. Wait for DOM
        await page.waitForLoadState('domcontentloaded');

        // 3. Scroll to trigger lazy loading
        await triggerLazyLoading(page);

        // 4. Settle animations
        await page.waitForTimeout(ANIMATION_SETTLE_MS);

        // 5. Capture
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
