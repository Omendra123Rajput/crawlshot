import { chromium, type Browser } from 'playwright';
import { logger } from '@screenshot-crawler/utils';

const BROWSER_LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
];

class BrowserPool {
  private browsers: Browser[] = [];
  private currentIndex = 0;
  private maxBrowsers: number;
  private initPromise: Promise<void> | null = null;

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
      try {
        const browser = await chromium.launch({
          args: BROWSER_LAUNCH_ARGS,
          headless: true,
        });
        this.browsers.push(browser);
        logger.info({ index: i }, 'Browser instance launched');
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error({ index: i, error: error.message, stack: error.stack }, 'Failed to launch browser');
        throw error;
      }
    }
    logger.info({ count: this.browsers.length }, 'Browser pool ready');
  }

  getBrowser(): Browser {
    if (this.browsers.length === 0) {
      throw new Error('Browser pool not initialized');
    }

    const browser = this.browsers[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.browsers.length;
    return browser;
  }

  async close(): Promise<void> {
    logger.info('Closing browser pool');
    await Promise.all(this.browsers.map((b) => b.close()));
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
