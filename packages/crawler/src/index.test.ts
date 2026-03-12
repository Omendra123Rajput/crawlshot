import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock external modules before imports
vi.mock('@screenshot-crawler/utils', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
  MAX_PAGES: 10000,
  REQUESTS_PER_SECOND: 2,
  USER_AGENT: 'ScreenshotCrawler/1.0',
}));

vi.mock('./ssrf-guard', () => ({
  guardUrl: vi.fn().mockResolvedValue(undefined),
  SSRFBlockedError: class SSRFBlockedError extends Error {
    blockedIp: string;
    hostname: string;
    constructor(hostname: string, blockedIp: string) {
      super(`SSRF blocked: ${hostname} resolved to blocked IP ${blockedIp}`);
      this.name = 'SSRFBlockedError';
      this.blockedIp = blockedIp;
      this.hostname = hostname;
    }
  },
}));

vi.mock('./robots-parser', () => {
  const mockFetch = vi.fn().mockResolvedValue(undefined);
  const mockIsAllowed = vi.fn().mockReturnValue(true);

  class MockRobotsParser {
    fetch = mockFetch;
    isAllowed = mockIsAllowed;

    static _mockFetch = mockFetch;
    static _mockIsAllowed = mockIsAllowed;
  }

  return { RobotsParser: MockRobotsParser };
});

vi.mock('./sitemap-parser', () => ({
  parseSitemap: vi.fn().mockResolvedValue([]),
}));

vi.mock('./link-extractor', () => ({
  extractLinks: vi.fn().mockResolvedValue([]),
}));

vi.mock('p-throttle', () => ({
  default: () => (fn: (...args: unknown[]) => unknown) => fn,
}));

import { crawlSite } from './index';
import { guardUrl } from './ssrf-guard';
import { RobotsParser } from './robots-parser';
import { parseSitemap } from './sitemap-parser';
import { extractLinks } from './link-extractor';

// Access the static mocks on the MockRobotsParser class
const mockRobotsIsAllowed = (RobotsParser as unknown as { _mockIsAllowed: ReturnType<typeof vi.fn> })._mockIsAllowed;
const mockRobotsFetch = (RobotsParser as unknown as { _mockFetch: ReturnType<typeof vi.fn> })._mockFetch;

describe('crawlSite', () => {
  beforeEach(() => {
    // Reset individual mocks to defaults
    vi.mocked(guardUrl).mockReset().mockResolvedValue(undefined);
    vi.mocked(parseSitemap).mockReset().mockResolvedValue([]);
    vi.mocked(extractLinks).mockReset().mockResolvedValue([]);
    mockRobotsIsAllowed.mockReset().mockReturnValue(true);
    mockRobotsFetch.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns seed URL in results', async () => {
    const onPageFound = vi.fn();
    const result = await crawlSite('job-1', 'https://example.com', onPageFound);

    expect(result).toContain('https://example.com/');
  });

  it('discovers linked pages from seed', async () => {
    vi.mocked(extractLinks)
      .mockResolvedValueOnce(['https://example.com/about'])
      .mockResolvedValue([]);

    const onPageFound = vi.fn();
    const result = await crawlSite('job-2', 'https://example.com', onPageFound);

    expect(result).toContain('https://example.com/');
    expect(result).toContain('https://example.com/about');
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('deduplicates discovered URLs', async () => {
    // Return the same URL twice from extractLinks
    vi.mocked(extractLinks)
      .mockResolvedValueOnce([
        'https://example.com/about',
        'https://example.com/about',
      ])
      .mockResolvedValue([]);

    const onPageFound = vi.fn();
    const result = await crawlSite('job-3', 'https://example.com', onPageFound);

    const aboutCount = result.filter((u) => u === 'https://example.com/about').length;
    expect(aboutCount).toBe(1);
  });

  it('calls guardUrl before fetching each discovered URL', async () => {
    vi.mocked(extractLinks)
      .mockResolvedValueOnce(['https://example.com/contact'])
      .mockResolvedValue([]);

    const onPageFound = vi.fn();
    await crawlSite('job-4', 'https://example.com', onPageFound);

    expect(guardUrl).toHaveBeenCalledWith('https://example.com/');
    expect(guardUrl).toHaveBeenCalledWith('https://example.com/contact');
  });

  it('excludes URLs blocked by robots.txt', async () => {
    mockRobotsIsAllowed.mockImplementation((url: string) => {
      return !url.includes('/admin');
    });

    vi.mocked(parseSitemap).mockResolvedValue(['https://example.com/admin/panel']);
    vi.mocked(extractLinks).mockResolvedValue([]);

    const onPageFound = vi.fn();
    const result = await crawlSite('job-5', 'https://example.com', onPageFound);

    expect(result).not.toContain('https://example.com/admin/panel');
  });

  it('calls onPageFound callback for each discovered page', async () => {
    vi.mocked(extractLinks)
      .mockResolvedValueOnce(['https://example.com/blog'])
      .mockResolvedValue([]);

    const onPageFound = vi.fn();
    await crawlSite('job-6', 'https://example.com', onPageFound);

    expect(onPageFound).toHaveBeenCalledWith('https://example.com/');
    expect(onPageFound).toHaveBeenCalledWith('https://example.com/blog');
  });
});
