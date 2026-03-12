import pThrottle from 'p-throttle';
import { guardUrl, SSRFBlockedError } from './ssrf-guard';
import { normalizeUrl } from './url-normalizer';
import { RobotsParser } from './robots-parser';
import { parseSitemap } from './sitemap-parser';
import { extractLinks } from './link-extractor';
import { logger, MAX_PAGES, REQUESTS_PER_SECOND } from '@screenshot-crawler/utils';

export { guardUrl, SSRFBlockedError } from './ssrf-guard';
export { normalizeUrl } from './url-normalizer';
export { RobotsParser } from './robots-parser';
export { parseSitemap } from './sitemap-parser';
export { extractLinks } from './link-extractor';

export async function crawlSite(
  jobId: string,
  baseUrl: string,
  onPageFound: (url: string) => void
): Promise<string[]> {
  const log = logger.child({ jobId, baseUrl });
  const visited = new Set<string>();
  const queue: string[] = [];
  const foundPages: string[] = [];

  // Rate limit: max 2 requests/second per domain
  const throttle = pThrottle({ limit: REQUESTS_PER_SECOND, interval: 1000 });
  const throttledExtract = throttle(extractLinks);

  // 1. Parse robots.txt
  const robots = new RobotsParser();
  await robots.fetch(baseUrl);
  log.info('robots.txt loaded');

  // 2. Parse sitemap.xml and seed queue
  const sitemapUrls = await parseSitemap(baseUrl);
  for (const url of sitemapUrls) {
    const normalized = normalizeUrl(url, baseUrl);
    if (normalized && !visited.has(normalized)) {
      visited.add(normalized);
      queue.push(normalized);
    }
  }
  log.info({ sitemapSeeds: queue.length }, 'Sitemap URLs seeded');

  // 3. Seed with base URL if not already present
  const normalizedBase = normalizeUrl(baseUrl, baseUrl);
  if (normalizedBase && !visited.has(normalizedBase)) {
    visited.add(normalizedBase);
    queue.unshift(normalizedBase);
  }

  // 4. Crawl loop
  while (queue.length > 0 && foundPages.length < MAX_PAGES) {
    // Process in batches of CRAWL_CONCURRENCY (5)
    const batch = queue.splice(0, 5);

    const batchPromises = batch.map(async (url) => {
      if (foundPages.length >= MAX_PAGES) return;

      // Check robots.txt
      if (!robots.isAllowed(url)) {
        log.debug({ url }, 'Blocked by robots.txt');
        return;
      }

      // SSRF guard
      try {
        await guardUrl(url);
      } catch (error) {
        if (error instanceof SSRFBlockedError) {
          log.warn({ url, ip: error.blockedIp }, 'SSRF blocked');
        }
        return;
      }

      // Register page as found
      foundPages.push(url);
      onPageFound(url);
      log.debug({ url, totalFound: foundPages.length }, 'Page found');

      // Extract links from this page
      try {
        const links = await throttledExtract(url, baseUrl);
        for (const link of links) {
          if (!visited.has(link) && foundPages.length + queue.length < MAX_PAGES) {
            visited.add(link);
            queue.push(link);
          }
        }
      } catch (error) {
        log.warn({ url, error: String(error) }, 'Link extraction failed');
      }
    });

    await Promise.all(batchPromises);
  }

  log.info({ totalPages: foundPages.length }, 'Crawl complete');
  return foundPages;
}
