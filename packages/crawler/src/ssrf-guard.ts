import dns from 'dns/promises';
import ipRangeCheck from 'ip-range-check';
import { logger } from '@screenshot-crawler/utils';

export class SSRFBlockedError extends Error {
  public readonly blockedIp: string;
  public readonly hostname: string;

  constructor(hostname: string, blockedIp: string) {
    super(`SSRF blocked: ${hostname} resolved to blocked IP ${blockedIp}`);
    this.name = 'SSRFBlockedError';
    this.blockedIp = blockedIp;
    this.hostname = hostname;
  }
}

const BLOCKED_CIDRS = [
  '127.0.0.0/8',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '169.254.0.0/16',
  '0.0.0.0/8',
  '100.64.0.0/10',
  '192.0.0.0/24',
  '198.18.0.0/15',
  '224.0.0.0/4',
  '240.0.0.0/4',
  '::1/128',
  'fc00::/7',
  'fe80::/10',
];

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  '169.254.169.254',
  '[::1]',
]);

export async function guardUrl(url: string): Promise<void> {
  const parsed = new URL(url);
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');

  if (BLOCKED_HOSTNAMES.has(hostname) || BLOCKED_HOSTNAMES.has(parsed.hostname)) {
    throw new SSRFBlockedError(hostname, hostname);
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`Only HTTPS URLs are allowed, got: ${parsed.protocol}`);
  }

  let ips: string[] = [];

  // Try resolve4/resolve6 first (direct DNS queries)
  try {
    const ipv4 = await dns.resolve4(hostname);
    ips.push(...ipv4);
  } catch {
    // No A records or DNS server unavailable
  }

  try {
    const ipv6 = await dns.resolve6(hostname);
    ips.push(...ipv6);
  } catch {
    // No AAAA records or DNS server unavailable
  }

  // Fallback to OS resolver (dns.lookup) if direct queries failed
  if (ips.length === 0) {
    try {
      const results = await dns.lookup(hostname, { all: true });
      for (const result of results) {
        ips.push(result.address);
      }
    } catch {
      // OS resolver also failed
    }
  }

  if (ips.length === 0) {
    throw new Error(`DNS resolution failed for hostname: ${hostname}`);
  }

  for (const ip of ips) {
    if (ipRangeCheck(ip, BLOCKED_CIDRS)) {
      logger.warn({ hostname, blockedIp: ip }, 'SSRF guard blocked request');
      throw new SSRFBlockedError(hostname, ip);
    }
  }
}
