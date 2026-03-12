import { describe, it, expect, vi } from 'vitest';
import path from 'path';
import { safePath, sanitizeFilename } from './sanitize-path';

// Mock @screenshot-crawler/utils if needed (sanitize-path imports MAX_FILENAME_LENGTH from it)
vi.mock('@screenshot-crawler/utils', () => ({
  MAX_FILENAME_LENGTH: 100,
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

describe('safePath — path traversal prevention', () => {
  const baseDir = '/screenshots/jobs/abc123';

  describe('directory traversal rejection', () => {
    it('throws on ../traversal pattern going outside base', () => {
      expect(() => safePath(baseDir, '../../../etc/passwd')).toThrow('Path traversal detected');
    });

    it('throws on ../ going one level up from base', () => {
      expect(() => safePath(baseDir, '../other-job')).toThrow('Path traversal detected');
    });

    it('throws on absolute path outside base', () => {
      expect(() => safePath(baseDir, '/etc/passwd')).toThrow('Path traversal detected');
    });
  });

  describe('valid path acceptance', () => {
    it('accepts a normal filename within base', () => {
      const result = safePath(baseDir, 'screenshot.png');
      expect(result).toBe(path.resolve(baseDir, 'screenshot.png'));
    });

    it('accepts nested subdirectory within base', () => {
      const result = safePath(baseDir, 'desktop', 'page.png');
      expect(result).toBe(path.resolve(baseDir, 'desktop', 'page.png'));
    });

    it('returns resolved absolute path', () => {
      const result = safePath(baseDir, 'image.png');
      expect(path.isAbsolute(result)).toBe(true);
    });
  });
});

describe('sanitizeFilename — URL to safe filename', () => {
  describe('root URL handling', () => {
    it('returns homepage.png for root path', () => {
      expect(sanitizeFilename('https://example.com/')).toBe('homepage.png');
    });

    it('returns homepage.png for URL with no pathname', () => {
      expect(sanitizeFilename('https://example.com')).toBe('homepage.png');
    });
  });

  describe('pathname to filename conversion', () => {
    it('converts slashes to underscores', () => {
      const result = sanitizeFilename('https://example.com/about/team');
      expect(result).toBe('about_team.png');
    });

    it('strips non-alphanumeric characters', () => {
      const result = sanitizeFilename('https://example.com/blog/hello-world');
      expect(result).toBe('blog_hello-world.png');
    });

    it('appends .png extension', () => {
      const result = sanitizeFilename('https://example.com/page');
      expect(result).toMatch(/\.png$/);
    });
  });

  describe('edge cases', () => {
    it('handles malformed URLs by returning unknown.png', () => {
      expect(sanitizeFilename('not-a-url')).toBe('unknown.png');
    });

    it('truncates filename exceeding max length', () => {
      const longPath = 'a'.repeat(200);
      const result = sanitizeFilename(`https://example.com/${longPath}`);
      // filename portion should be no longer than MAX_FILENAME_LENGTH + '.png'.length
      expect(result.length).toBeLessThanOrEqual(104 + 1); // 100 chars + .png
    });
  });
});
