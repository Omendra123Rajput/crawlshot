import { logger } from '@screenshot-crawler/utils';

interface RobotsRule {
  path: string;
  allow: boolean;
}

export class RobotsParser {
  private rules: RobotsRule[] = [];
  private loaded = false;

  async fetch(baseUrl: string): Promise<void> {
    try {
      const robotsUrl = new URL('/robots.txt', baseUrl).toString();
      const response = await fetch(robotsUrl, {
        headers: { 'User-Agent': 'ScreenshotCrawler/1.0' },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        logger.info({ status: response.status }, 'robots.txt not found, allowing all');
        this.loaded = true;
        return;
      }

      const text = await response.text();
      this.parse(text);
      this.loaded = true;
    } catch (error) {
      logger.warn({ error: String(error) }, 'Failed to fetch robots.txt, allowing all');
      this.loaded = true;
    }
  }

  private parse(text: string): void {
    let isRelevantAgent = false;

    for (const rawLine of text.split('\n')) {
      const line = rawLine.trim();

      if (line.startsWith('#') || line === '') continue;

      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;

      const directive = line.slice(0, colonIdx).trim().toLowerCase();
      const value = line.slice(colonIdx + 1).trim();

      if (directive === 'user-agent') {
        isRelevantAgent = value === '*' || value.toLowerCase().includes('screenshotcrawler');
      } else if (isRelevantAgent && directive === 'disallow' && value) {
        this.rules.push({ path: value, allow: false });
      } else if (isRelevantAgent && directive === 'allow' && value) {
        this.rules.push({ path: value, allow: true });
      }
    }
  }

  isAllowed(url: string): boolean {
    if (!this.loaded) return true;

    try {
      const pathname = new URL(url).pathname;

      // More specific rules take precedence; check longest match
      let bestMatch: RobotsRule | null = null;
      let bestLength = 0;

      for (const rule of this.rules) {
        if (pathname.startsWith(rule.path) && rule.path.length > bestLength) {
          bestMatch = rule;
          bestLength = rule.path.length;
        }
      }

      return bestMatch ? bestMatch.allow : true;
    } catch {
      return true;
    }
  }
}
