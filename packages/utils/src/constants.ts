export const MAX_PAGES = 10_000;
export const MAX_URL_LENGTH = 2048;
export const MAX_FILENAME_LENGTH = 100;

export const CRAWL_CONCURRENCY = 5;
export const SCREENSHOT_CONCURRENCY = 10;
export const REQUESTS_PER_SECOND = 2;

export const PAGE_LOAD_TIMEOUT_MS = 30_000;
export const CAPTURE_HARD_TIMEOUT_MS = 35_000;
export const ANIMATION_SETTLE_MS = 2_000;
export const SCROLL_STEP_PX = 300;
export const SCROLL_INTERVAL_MS = 100;

export const VIEWPORTS = {
  desktop: { width: 1920, height: 1080 },
  mobile: { width: 390, height: 844 },
} as const;

export const USER_AGENT = 'ScreenshotCrawler/1.0 (+https://screenshot-crawler.dev/bot)';
export const BROWSER_USER_AGENT = 'Mozilla/5.0 (compatible; ScreenshotCrawler/1.0)';

export const QUEUE_NAMES = {
  CRAWL: 'crawl',
  SCREENSHOT: 'screenshot',
} as const;

export type ViewportKey = keyof typeof VIEWPORTS;
