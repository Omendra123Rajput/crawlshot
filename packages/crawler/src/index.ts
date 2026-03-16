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

export interface CrawlOptions {
  maxDepth: number;
}

export async function crawlSite(
  jobId: string,
  baseUrl: string,
  onPageFound: (url: string) => void,
  options: CrawlOptions = { maxDepth: -1 }
): Promise<string[]> {
  const log = logger.child({ jobId, baseUrl });
  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [];
  const foundPages: string[] = [];
  const maxDepth = options.maxDepth;

  // Rate limit: max 2 requests/second per domain
  const throttle = pThrottle({ limit: REQUESTS_PER_SECOND, interval: 1000 });
  const throttledExtract = throttle(extractLinks);

  // 1. Parse robots.txt
  const robots = new RobotsParser();
  await robots.fetch(baseUrl);
  log.info('robots.txt loaded');

  // 2. Parse sitemap.xml and seed queue (depth 1 — one click from root)
  const sitemapUrls = await parseSitemap(baseUrl);
  for (const url of sitemapUrls) {
    const normalized = normalizeUrl(url, baseUrl);
    if (normalized && !visited.has(normalized)) {
      visited.add(normalized);
      queue.push({ url: normalized, depth: 1 });
    }
  }
  log.info({ sitemapSeeds: queue.length }, 'Sitemap URLs seeded');

  // 3. Seed with base URL if not already present (depth 0 — root)
  const normalizedBase = normalizeUrl(baseUrl, baseUrl);
  if (normalizedBase && !visited.has(normalizedBase)) {
    visited.add(normalizedBase);
    queue.unshift({ url: normalizedBase, depth: 0 });
  }

  // 4. Crawl loop
  while (queue.length > 0 && foundPages.length < MAX_PAGES) {
    // Process in batches of CRAWL_CONCURRENCY (5)
    const batch = queue.splice(0, 5);

    const batchPromises = batch.map(async (item) => {
      if (foundPages.length >= MAX_PAGES) return;

      // Check robots.txt
      if (!robots.isAllowed(item.url)) {
        log.debug({ url: item.url }, 'Blocked by robots.txt');
        return;
      }

      // SSRF guard
      try {
        await guardUrl(item.url);
      } catch (error) {
        if (error instanceof SSRFBlockedError) {
          log.warn({ url: item.url, ip: error.blockedIp }, 'SSRF blocked');
        }
        return;
      }

      // Register page as found
      foundPages.push(item.url);
      onPageFound(item.url);
      log.debug({ url: item.url, depth: item.depth, totalFound: foundPages.length }, 'Page found');

      // Only extract child links if we haven't reached maxDepth
      // maxDepth -1 means unlimited
      if (maxDepth !== -1 && item.depth >= maxDepth) return;

      // Extract links from this page
      try {
        const links = await throttledExtract(item.url, baseUrl);
        for (const link of links) {
          if (!visited.has(link) && foundPages.length + queue.length < MAX_PAGES) {
            visited.add(link);
            queue.push({ url: link, depth: item.depth + 1 });
          }
        }
      } catch (error) {
        log.warn({ url: item.url, error: String(error) }, 'Link extraction failed');
      }
    });

    await Promise.all(batchPromises);
  }

  log.info({ totalPages: foundPages.length, maxDepth }, 'Crawl complete');
  return foundPages;
}
