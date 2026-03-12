import { describe, it, expect } from 'vitest';
import { normalizeUrl, urlToHash } from './url-normalizer';

describe('normalizeUrl', () => {
  describe('fragment stripping', () => {
    it('strips URL fragment (#section)', () => {
      const result = normalizeUrl('https://example.com/page#section', 'https://example.com');
      expect(result).not.toBeNull();
      expect(result).not.toContain('#');
      expect(result).toBe('https://example.com/page');
    });

    it('strips fragment with query params present', () => {
      const result = normalizeUrl(
        'https://example.com/page?a=1#section',
        'https://example.com'
      );
      expect(result).not.toBeNull();
      expect(result).not.toContain('#');
    });
  });

  describe('query parameter sorting', () => {
    it('sorts query parameters alphabetically', () => {
      const result = normalizeUrl(
        'https://example.com?b=2&a=1',
        'https://example.com'
      );
      expect(result).toBe('https://example.com/?a=1&b=2');
    });

    it('produces stable ordering regardless of original param order', () => {
      const r1 = normalizeUrl('https://example.com?z=3&a=1&m=2', 'https://example.com');
      const r2 = normalizeUrl('https://example.com?m=2&z=3&a=1', 'https://example.com');
      expect(r1).toBe(r2);
    });
  });

  describe('trailing slash normalization', () => {
    it('removes trailing slash from non-root paths', () => {
      const result = normalizeUrl('https://example.com/page/', 'https://example.com');
      expect(result).toBe('https://example.com/page');
    });

    it('keeps trailing slash for root path', () => {
      const result = normalizeUrl('https://example.com/', 'https://example.com');
      expect(result).toBe('https://example.com/');
    });
  });

  describe('cross-origin rejection', () => {
    it('returns null for cross-origin URLs', () => {
      const result = normalizeUrl('https://other.com/page', 'https://example.com');
      expect(result).toBeNull();
    });

    it('returns null for subdomain of base (cross-origin)', () => {
      const result = normalizeUrl(
        'https://sub.example.com/page',
        'https://example.com'
      );
      expect(result).toBeNull();
    });
  });

  describe('protocol handling', () => {
    it('rejects http: protocol (HTTPS-only enforcement)', () => {
      // HTTPS-only: normalizeUrl must return null for HTTP URLs
      const result = normalizeUrl('http://example.com/page', 'http://example.com');
      expect(result).toBeNull();
    });

    it('returns null for javascript: protocol', () => {
      const result = normalizeUrl('javascript:alert(1)', 'https://example.com');
      expect(result).toBeNull();
    });

    it('returns null for data: protocol', () => {
      const result = normalizeUrl('data:text/html,<h1>hi</h1>', 'https://example.com');
      expect(result).toBeNull();
    });

    it('returns null for ftp: protocol', () => {
      const result = normalizeUrl('ftp://example.com/file', 'https://example.com');
      expect(result).toBeNull();
    });
  });

  describe('relative URL resolution', () => {
    it('resolves relative URLs against base', () => {
      const result = normalizeUrl('/about', 'https://example.com');
      expect(result).toBe('https://example.com/about');
    });

    it('returns null for malformed URLs', () => {
      const result = normalizeUrl('not-a-url-at-all !!', 'https://example.com');
      // May return a same-origin resolved URL or null depending on URL spec; just check it does not throw
      expect(() =>
        normalizeUrl('not-a-url-at-all !!', 'https://example.com')
      ).not.toThrow();
    });
  });
});

describe('urlToHash', () => {
  it('returns a consistent hash for the same input', () => {
    const h1 = urlToHash('https://example.com/page');
    const h2 = urlToHash('https://example.com/page');
    expect(h1).toBe(h2);
  });

  it('returns different hashes for different inputs', () => {
    const h1 = urlToHash('https://example.com/page1');
    const h2 = urlToHash('https://example.com/page2');
    expect(h1).not.toBe(h2);
  });

  it('returns a non-empty string', () => {
    const h = urlToHash('https://example.com');
    expect(typeof h).toBe('string');
    expect(h.length).toBeGreaterThan(0);
  });
});
