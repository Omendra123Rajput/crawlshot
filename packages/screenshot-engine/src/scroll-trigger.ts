import type { Page } from 'playwright';
import { SCROLL_STEP_PX, SCROLL_INTERVAL_MS } from '@screenshot-crawler/utils';

export async function triggerLazyLoading(page: Page): Promise<void> {
  await page.evaluate(
    async ({ distance, interval }) => {
      await new Promise<void>((resolve) => {
        let totalHeight = 0;
        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= document.body.scrollHeight) {
            clearInterval(timer);
            window.scrollTo(0, 0);
            resolve();
          }
        }, interval);
      });
    },
    { distance: SCROLL_STEP_PX, interval: SCROLL_INTERVAL_MS }
  );
}
