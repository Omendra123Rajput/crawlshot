import { chromium, type Browser } from 'playwright';
import { logger } from '@screenshot-crawler/utils';

const BROWSER_LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
];

class BrowserPool {
  private browsers: (Browser | null)[] = [];
  private currentIndex = 0;
  private maxBrowsers: number;
  private initPromise: Promise<void> | null = null;
  private relaunching: Map<number, Promise<void>> = new Map();

  constructor(maxBrowsers: number = 1) {
    this.maxBrowsers = maxBrowsers;
  }

  async initialize(): Promise<void> {
    if (this.browsers.length > 0) return;
    if (!this.initPromise) {
      this.initPromise = this.doInitialize().catch((err) => {
        // Reset so next call can retry
        this.initPromise = null;
        throw err;
      });
    }
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    logger.info({ maxBrowsers: this.maxBrowsers }, 'Initializing browser pool');
    for (let i = 0; i < this.maxBrowsers; i++) {
      await this.launchBrowser(i);
    }
    logger.info({ count: this.browsers.length }, 'Browser pool ready');
  }

  private async launchBrowser(index: number): Promise<void> {
    try {
      const browser = await chromium.launch({
        args: BROWSER_LAUNCH_ARGS,
        headless: true,
      });

      // Auto-recover on crash: listen for disconnect and relaunch
      browser.on('disconnected', () => {
        logger.warn({ index }, 'Browser disconnected — scheduling relaunch');
        this.browsers[index] = null;
        this.relaunchBrowser(index);
      });

      this.browsers[index] = browser;
      logger.info({ index }, 'Browser instance launched');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error({ index, error: error.message, stack: error.stack }, 'Failed to launch browser');
      throw error;
    }
  }

  private relaunchBrowser(index: number): void {
    if (this.relaunching.has(index)) return; // Already relaunching

    const promise = this.launchBrowser(index)
      .catch((err) => {
        logger.error({ index, error: String(err) }, 'Browser relaunch failed');
      })
      .finally(() => {
        this.relaunching.delete(index);
      });

    this.relaunching.set(index, promise);
  }

  async getBrowser(): Promise<Browser> {
    if (this.browsers.length === 0) {
      throw new Error('Browser pool not initialized');
    }

    // Try each slot once to find a connected browser
    for (let i = 0; i < this.browsers.length; i++) {
      const idx = (this.currentIndex + i) % this.browsers.length;
      const browser = this.browsers[idx];

      if (browser && browser.isConnected()) {
        this.currentIndex = (idx + 1) % this.browsers.length;
        return browser;
      }
    }

    // All browsers are dead — wait for any pending relaunch
    const pending = Array.from(this.relaunching.values());
    if (pending.length > 0) {
      await Promise.race(pending);
      // Retry after relaunch completes
      return this.getBrowser();
    }

    throw new Error('All browsers crashed and relaunch failed');
  }

  async close(): Promise<void> {
    logger.info('Closing browser pool');
    await Promise.all(
      this.browsers.map((b) => b?.isConnected() ? b.close() : Promise.resolve())
    );
    this.browsers = [];
    this.initPromise = null;
  }
}

let pool: BrowserPool | null = null;

export function getBrowserPool(): BrowserPool {
  if (!pool) {
    pool = new BrowserPool();
  }
  return pool;
}

export async function closeBrowserPool(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
  }
}

export { BrowserPool };
