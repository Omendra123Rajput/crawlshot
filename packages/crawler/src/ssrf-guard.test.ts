import { describe, it, expect, vi, beforeEach } from 'vitest';
import { guardUrl, SSRFBlockedError } from './ssrf-guard';

// Mock dns/promises module to control DNS resolution in tests
vi.mock('dns/promises', () => ({
  default: {
    resolve4: vi.fn(),
    resolve6: vi.fn(),
    lookup: vi.fn(),
  },
  resolve4: vi.fn(),
  resolve6: vi.fn(),
  lookup: vi.fn(),
}));

// Mock logger to suppress output during tests
vi.mock('@screenshot-crawler/utils', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

import dns from 'dns/promises';

const mockDns = dns as {
  resolve4: ReturnType<typeof vi.fn>;
  resolve6: ReturnType<typeof vi.fn>;
  lookup: ReturnType<typeof vi.fn>;
};

describe('guardUrl — SSRF Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('protocol enforcement', () => {
    it('rejects http:// URLs with a plain Error (not SSRFBlockedError)', async () => {
      await expect(guardUrl('http://example.com')).rejects.toThrow(
        'Only HTTPS URLs are allowed'
      );
      await expect(guardUrl('http://example.com')).rejects.not.toBeInstanceOf(
        SSRFBlockedError
      );
    });
  });

  describe('blocked hostnames (checked before DNS)', () => {
    it('rejects localhost with SSRFBlockedError', async () => {
      await expect(guardUrl('https://localhost')).rejects.toBeInstanceOf(SSRFBlockedError);
    });

    it('rejects 169.254.169.254 (AWS metadata) with SSRFBlockedError', async () => {
      await expect(guardUrl('https://169.254.169.254')).rejects.toBeInstanceOf(SSRFBlockedError);
    });

    it('rejects metadata.google.internal with SSRFBlockedError', async () => {
      await expect(guardUrl('https://metadata.google.internal')).rejects.toBeInstanceOf(
        SSRFBlockedError
      );
    });
  });

  describe('private IPv4 ranges (via DNS mock)', () => {
    it('rejects URL resolving to 127.0.0.1 (loopback) with SSRFBlockedError', async () => {
      mockDns.resolve4.mockResolvedValueOnce(['127.0.0.1']);
      mockDns.resolve6.mockRejectedValueOnce(new Error('no AAAA'));
      await expect(guardUrl('https://evil.example.com')).rejects.toBeInstanceOf(SSRFBlockedError);
    });

    it('rejects URL resolving to 10.0.0.1 (RFC1918) with SSRFBlockedError', async () => {
      mockDns.resolve4.mockResolvedValueOnce(['10.0.0.1']);
      mockDns.resolve6.mockRejectedValueOnce(new Error('no AAAA'));
      await expect(guardUrl('https://internal.example.com')).rejects.toBeInstanceOf(
        SSRFBlockedError
      );
    });

    it('rejects URL resolving to 192.168.1.1 (RFC1918) with SSRFBlockedError', async () => {
      mockDns.resolve4.mockResolvedValueOnce(['192.168.1.1']);
      mockDns.resolve6.mockRejectedValueOnce(new Error('no AAAA'));
      await expect(guardUrl('https://router.example.com')).rejects.toBeInstanceOf(SSRFBlockedError);
    });

    it('rejects URL resolving to 172.16.0.1 (RFC1918) with SSRFBlockedError', async () => {
      mockDns.resolve4.mockResolvedValueOnce(['172.16.0.1']);
      mockDns.resolve6.mockRejectedValueOnce(new Error('no AAAA'));
      await expect(guardUrl('https://private.example.com')).rejects.toBeInstanceOf(SSRFBlockedError);
    });
  });

  describe('private IPv6 ranges (via DNS mock)', () => {
    it('rejects URL resolving to ::1 (IPv6 loopback) with SSRFBlockedError', async () => {
      mockDns.resolve4.mockRejectedValueOnce(new Error('no A'));
      mockDns.resolve6.mockResolvedValueOnce(['::1']);
      await expect(guardUrl('https://ipv6-evil.example.com')).rejects.toBeInstanceOf(
        SSRFBlockedError
      );
    });

    it('rejects URL resolving to fc00::1 (IPv6 ULA) with SSRFBlockedError', async () => {
      mockDns.resolve4.mockRejectedValueOnce(new Error('no A'));
      mockDns.resolve6.mockResolvedValueOnce(['fc00::1']);
      await expect(guardUrl('https://ipv6-ula.example.com')).rejects.toBeInstanceOf(
        SSRFBlockedError
      );
    });
  });

  describe('valid public URLs', () => {
    it('allows a URL resolving to a public IP (93.184.216.34 = example.com)', async () => {
      mockDns.resolve4.mockResolvedValueOnce(['93.184.216.34']);
      mockDns.resolve6.mockRejectedValueOnce(new Error('no AAAA'));
      await expect(guardUrl('https://example.com')).resolves.toBeUndefined();
    });
  });

  describe('DNS failure handling', () => {
    it('throws Error when all DNS resolution methods fail', async () => {
      mockDns.resolve4.mockRejectedValueOnce(new Error('ENOTFOUND'));
      mockDns.resolve6.mockRejectedValueOnce(new Error('ENOTFOUND'));
      mockDns.lookup.mockRejectedValueOnce(new Error('ENOTFOUND'));
      await expect(guardUrl('https://nonexistent.invalid')).rejects.toThrow(
        'DNS resolution failed'
      );
    });
  });

  describe('SSRFBlockedError properties', () => {
    it('exposes blockedIp and hostname on SSRFBlockedError', async () => {
      mockDns.resolve4.mockResolvedValueOnce(['10.10.10.10']);
      mockDns.resolve6.mockRejectedValueOnce(new Error('no AAAA'));
      try {
        await guardUrl('https://internal.corp.example.com');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(SSRFBlockedError);
        const ssrfErr = err as SSRFBlockedError;
        expect(ssrfErr.blockedIp).toBe('10.10.10.10');
        expect(ssrfErr.hostname).toBe('internal.corp.example.com');
      }
    });
  });
});
