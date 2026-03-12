import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RobotsParser } from './robots-parser';

// Mock logger to suppress output during tests
vi.mock('@screenshot-crawler/utils', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

describe('RobotsParser', () => {
  let parser: RobotsParser;

  beforeEach(() => {
    parser = new RobotsParser();
    vi.clearAllMocks();
  });

  describe('before fetch', () => {
    it('isAllowed returns true for any URL before fetch() is called', () => {
      expect(parser.isAllowed('https://example.com/private/page')).toBe(true);
      expect(parser.isAllowed('https://example.com/any/path')).toBe(true);
    });
  });

  describe('disallow rules', () => {
    it('returns false for disallowed path after parsing rules', async () => {
      const robotsTxt = `
User-agent: *
Disallow: /private
      `.trim();

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce({
          ok: true,
          text: async () => robotsTxt,
        })
      );

      await parser.fetch('https://example.com');
      expect(parser.isAllowed('https://example.com/private')).toBe(false);
      expect(parser.isAllowed('https://example.com/private/page')).toBe(false);
      expect(parser.isAllowed('https://example.com/private/nested/path')).toBe(false);
    });

    it('returns true for paths not covered by any disallow rule', async () => {
      const robotsTxt = `
User-agent: *
Disallow: /private
      `.trim();

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce({
          ok: true,
          text: async () => robotsTxt,
        })
      );

      await parser.fetch('https://example.com');
      expect(parser.isAllowed('https://example.com/public')).toBe(true);
      expect(parser.isAllowed('https://example.com/')).toBe(true);
    });
  });

  describe('allow rules with longest-match precedence', () => {
    it('specific Allow overrides general Disallow (longest-match wins)', async () => {
      const robotsTxt = `
User-agent: *
Disallow: /
Allow: /public
      `.trim();

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce({
          ok: true,
          text: async () => robotsTxt,
        })
      );

      await parser.fetch('https://example.com');

      // /public is more specific than /, so it should be allowed
      expect(parser.isAllowed('https://example.com/public')).toBe(true);
      expect(parser.isAllowed('https://example.com/public/page')).toBe(true);

      // /secret is only matched by Disallow: / so it should be blocked
      expect(parser.isAllowed('https://example.com/secret')).toBe(false);
    });

    it('longer disallow takes precedence over shorter allow', async () => {
      const robotsTxt = `
User-agent: *
Allow: /public
Disallow: /public/restricted
      `.trim();

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce({
          ok: true,
          text: async () => robotsTxt,
        })
      );

      await parser.fetch('https://example.com');

      expect(parser.isAllowed('https://example.com/public/page')).toBe(true);
      expect(parser.isAllowed('https://example.com/public/restricted/item')).toBe(false);
    });
  });

  describe('wildcard user-agent (*)', () => {
    it('applies rules from user-agent * block', async () => {
      const robotsTxt = `
User-agent: *
Disallow: /admin
      `.trim();

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce({
          ok: true,
          text: async () => robotsTxt,
        })
      );

      await parser.fetch('https://example.com');
      expect(parser.isAllowed('https://example.com/admin')).toBe(false);
      expect(parser.isAllowed('https://example.com/home')).toBe(true);
    });

    it('applies rules from screenshotcrawler user-agent block', async () => {
      const robotsTxt = `
User-agent: ScreenshotCrawler
Disallow: /crawl-blocked
      `.trim();

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce({
          ok: true,
          text: async () => robotsTxt,
        })
      );

      await parser.fetch('https://example.com');
      expect(parser.isAllowed('https://example.com/crawl-blocked')).toBe(false);
    });
  });

  describe('missing or failing robots.txt', () => {
    it('allows all URLs when robots.txt returns 404', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce({
          ok: false,
          status: 404,
          text: async () => '',
        })
      );

      await parser.fetch('https://example.com');
      expect(parser.isAllowed('https://example.com/anything')).toBe(true);
      expect(parser.isAllowed('https://example.com/private')).toBe(true);
    });

    it('allows all URLs when fetch throws a network error', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValueOnce(new Error('network error'))
      );

      await parser.fetch('https://example.com');
      expect(parser.isAllowed('https://example.com/anything')).toBe(true);
    });

    it('allows all URLs when robots.txt is empty', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce({
          ok: true,
          text: async () => '',
        })
      );

      await parser.fetch('https://example.com');
      expect(parser.isAllowed('https://example.com/page')).toBe(true);
    });
  });
});
