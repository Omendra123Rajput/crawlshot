import { parse } from 'node-html-parser';
import { normalizeUrl } from './url-normalizer';
import { logger, USER_AGENT } from '@screenshot-crawler/utils';

const MAX_REDIRECTS = 5;

/** Follow redirects manually with a cap to prevent infinite redirect chains */
async function fetchWithRedirectLimit(url: string, maxRedirects = MAX_REDIRECTS): Promise<Response> {
  let current = url;
  for (let i = 0; i <= maxRedirects; i++) {
    const response = await fetch(current, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(15_000),
      redirect: 'manual',
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return response;
      current = new URL(location, current).href;
      continue;
    }

    return response;
  }

  throw new Error(`Too many redirects (>${maxRedirects}) for ${url}`);
}

export async function extractLinks(pageUrl: string, baseUrl: string): Promise<string[]> {
  const links: string[] = [];

  try {
    const response = await fetchWithRedirectLimit(pageUrl);

    if (!response.ok) {
      logger.warn({ url: pageUrl, status: response.status }, 'Failed to fetch page for link extraction');
      return links;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return links;
    }

    const html = await response.text();
    const root = parse(html);
    const anchors = root.querySelectorAll('a[href]');

    for (const anchor of anchors) {
      const href = anchor.getAttribute('href');
      if (!href) continue;

      // Skip javascript:, mailto:, tel:, data: URLs
      if (/^(javascript|mailto|tel|data):/i.test(href)) continue;

      const normalized = normalizeUrl(href, pageUrl);
      if (normalized) {
        links.push(normalized);
      }
    }
  } catch (error) {
    logger.warn({ url: pageUrl, error: String(error) }, 'Link extraction error');
  }

  return links;
}
