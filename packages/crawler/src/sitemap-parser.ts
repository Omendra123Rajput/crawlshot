import { XMLParser } from 'fast-xml-parser';
import { logger } from '@screenshot-crawler/utils';

export async function parseSitemap(baseUrl: string): Promise<string[]> {
  const urls: string[] = [];
  const parser = new XMLParser({ ignoreAttributes: false });

  try {
    const sitemapUrl = new URL('/sitemap.xml', baseUrl).toString();
    const response = await fetch(sitemapUrl, {
      headers: { 'User-Agent': 'ScreenshotCrawler/1.0' },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      logger.info({ status: response.status }, 'sitemap.xml not found');
      return urls;
    }

    const xml = await response.text();
    const parsed = parser.parse(xml);

    // Handle sitemap index
    if (parsed.sitemapindex?.sitemap) {
      const sitemaps = Array.isArray(parsed.sitemapindex.sitemap)
        ? parsed.sitemapindex.sitemap
        : [parsed.sitemapindex.sitemap];

      for (const sitemap of sitemaps.slice(0, 10)) {
        const loc = sitemap.loc;
        if (loc) {
          const childUrls = await fetchSitemapUrls(loc, parser);
          urls.push(...childUrls);
        }
      }
    }

    // Handle regular sitemap
    if (parsed.urlset?.url) {
      const entries = Array.isArray(parsed.urlset.url)
        ? parsed.urlset.url
        : [parsed.urlset.url];

      for (const entry of entries) {
        if (entry.loc) {
          urls.push(entry.loc);
        }
      }
    }

    logger.info({ urlCount: urls.length }, 'Parsed sitemap URLs');
  } catch (error) {
    logger.warn({ error: String(error) }, 'Failed to parse sitemap');
  }

  return urls;
}

async function fetchSitemapUrls(sitemapUrl: string, parser: XMLParser): Promise<string[]> {
  const urls: string[] = [];

  try {
    const response = await fetch(sitemapUrl, {
      headers: { 'User-Agent': 'ScreenshotCrawler/1.0' },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) return urls;

    const xml = await response.text();
    const parsed = parser.parse(xml);

    if (parsed.urlset?.url) {
      const entries = Array.isArray(parsed.urlset.url)
        ? parsed.urlset.url
        : [parsed.urlset.url];

      for (const entry of entries) {
        if (entry.loc) {
          urls.push(entry.loc);
        }
      }
    }
  } catch {
    // Skip failed child sitemaps
  }

  return urls;
}
