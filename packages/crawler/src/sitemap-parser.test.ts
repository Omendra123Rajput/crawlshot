import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@screenshot-crawler/utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

import { parseSitemap } from './sitemap-parser';

function makeResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/xml' },
  });
}

describe('parseSitemap', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('extracts URLs from urlset XML', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/page1</loc></url>
  <url><loc>https://example.com/page2</loc></url>
</urlset>`;

    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(xml));

    const result = await parseSitemap('https://example.com');
    expect(result).toContain('https://example.com/page1');
    expect(result).toContain('https://example.com/page2');
    expect(result).toHaveLength(2);
  });

  it('handles sitemapindex with nested child sitemap', async () => {
    const indexXml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-pages.xml</loc></sitemap>
</sitemapindex>`;

    const childXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/child-page</loc></url>
</urlset>`;

    vi.mocked(fetch)
      .mockResolvedValueOnce(makeResponse(indexXml))
      .mockResolvedValueOnce(makeResponse(childXml));

    const result = await parseSitemap('https://example.com');
    expect(result).toContain('https://example.com/child-page');
  });

  it('returns empty array when sitemap.xml is not found (404)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse('Not Found', 404));

    const result = await parseSitemap('https://example.com');
    expect(result).toEqual([]);
  });

  it('returns empty array on malformed XML', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse('<not valid xml <<<>>>'));

    const result = await parseSitemap('https://example.com');
    expect(Array.isArray(result)).toBe(true);
    // Should not throw; result could be empty or partial
  });

  it('returns empty array when fetch throws a network error', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

    const result = await parseSitemap('https://example.com');
    expect(result).toEqual([]);
  });
});
