import type { Page } from 'playwright';

/**
 * Triggers lazy-loaded content by scrolling through the entire page.
 * Scrolls in viewport-sized steps, pausing at each to trigger
 * IntersectionObserver callbacks and lazy image loads.
 */
export async function triggerLazyLoading(page: Page): Promise<void> {
  // Scroll through the page to trigger lazy loading
  await scrollFullPage(page);

  // Wait for images triggered by scrolling
  await waitForAllImages(page);
}

async function scrollFullPage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const viewportHeight = window.innerHeight;
    const step = Math.floor(viewportHeight * 0.8);
    let previousHeight = 0;
    let currentHeight = document.body.scrollHeight;

    // Scroll through the page — repeat if page grows
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y <= currentHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise(r => setTimeout(r, 300));
      }

      // Scroll to very bottom
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise(r => setTimeout(r, 500));

      // Check if page grew
      const newHeight = document.body.scrollHeight;
      if (newHeight === currentHeight && pass > 0) break;
      previousHeight = currentHeight;
      currentHeight = newHeight;
    }

    // Scroll back to top
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 300));
  });
}

/**
 * Wait for all visible <img> elements to finish loading.
 */
async function waitForAllImages(page: Page): Promise<void> {
  try {
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 10_000);

        const images = Array.from(document.querySelectorAll('img'));
        const pending = images.filter((img) => !img.complete && img.src);

        if (pending.length === 0) {
          clearTimeout(timeout);
          resolve();
          return;
        }

        let remaining = pending.length;
        const onDone = () => {
          remaining--;
          if (remaining <= 0) {
            clearTimeout(timeout);
            resolve();
          }
        };

        for (const img of pending) {
          img.addEventListener('load', onDone, { once: true });
          img.addEventListener('error', onDone, { once: true });
        }
      });
    });
  } catch {
    // Not critical
  }
}
