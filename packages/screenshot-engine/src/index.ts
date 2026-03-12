import { getBrowserPool, closeBrowserPool } from './browser-pool';
import { capturePage, PageCaptureError } from './capture';
import { sanitizeFilename, safePath } from './sanitize-path';
import { logger, type ViewportKey } from '@screenshot-crawler/utils';

export { capturePage, PageCaptureError } from './capture';
export { sanitizeFilename, safePath } from './sanitize-path';
export { getBrowserPool, closeBrowserPool, BrowserPool } from './browser-pool';
export { triggerLazyLoading } from './scroll-trigger';

export class ScreenshotEngine {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const pool = getBrowserPool();
    await pool.initialize();
    this.initialized = true;
    logger.info('ScreenshotEngine initialized');
  }

  async capture(url: string, viewport: ViewportKey, outputDir: string): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }
    return capturePage(url, viewport, outputDir);
  }

  async close(): Promise<void> {
    await closeBrowserPool();
    this.initialized = false;
    logger.info('ScreenshotEngine closed');
  }
}
