export function normalizeUrl(rawUrl: string, baseUrl: string): string | null {
  try {
    const url = new URL(rawUrl, baseUrl);
    const base = new URL(baseUrl);

    // Only allow same-origin URLs
    if (url.origin !== base.origin) {
      return null;
    }

    // Only allow http/https
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    // Strip fragment
    url.hash = '';

    // Sort search params for dedup
    url.searchParams.sort();

    // Remove trailing slash for consistency (except root)
    let normalized = url.toString();
    if (normalized.endsWith('/') && url.pathname !== '/') {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  } catch {
    return null;
  }
}

export function urlToHash(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash.toString(36);
}
