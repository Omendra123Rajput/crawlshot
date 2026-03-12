import { chromium, type Browser } from 'playwright';
import { logger, SCREENSHOT_CONCURRENCY } from '@screenshot-crawler/utils';

const BROWSER_LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-features=VizDisplayCompositor',
];

class BrowserPool {
  private browsers: Browser[] = [];
  private currentIndex = 0;
  private maxBrowsers: number;
  private initialized = false;

  constructor(maxBrowsers: number = SCREENSHOT_CONCURRENCY) {
    this.maxBrowsers = maxBrowsers;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info({ maxBrowsers: this.maxBrowsers }, 'Initializing browser pool');

    for (let i = 0; i < this.maxBrowsers; i++) {
      const browser = await chromium.launch({ args: BROWSER_LAUNCH_ARGS });
      this.browsers.push(browser);
    }

    this.initialized = true;
    logger.info({ count: this.browsers.length }, 'Browser pool ready');
  }

  getBrowser(): Browser {
    if (!this.initialized || this.browsers.length === 0) {
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
    this.initialized = false;
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
