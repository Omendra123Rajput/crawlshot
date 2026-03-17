import { getRedisConnection } from '@screenshot-crawler/queue';
import { logger } from '@screenshot-crawler/utils';

interface JobStats {
  pagesFound: number;
  pagesScreenshotted: number;
  pagesFailed: number;
  viewports: number;
  url: string;
  startedAt: number;
}

export interface StatsContext {
  url: string;
  pagesFound: number;
  viewportCount: number;
}

const jobStatsMap = new Map<string, JobStats>();

export function initJobStats(jobId: string, url: string, viewportCount: number): void {
  jobStatsMap.set(jobId, {
    pagesFound: 0,
    pagesScreenshotted: 0,
    pagesFailed: 0,
    viewports: viewportCount,
    url,
    startedAt: Date.now(),
  });
}

export function setJobPagesFound(jobId: string, count: number): void {
  const stats = jobStatsMap.get(jobId);
  if (stats) {
    stats.pagesFound = count;
  }
}

/**
 * Ensure stats exist for a job. If missing (e.g., after worker restart),
 * lazily initialize from the screenshot job's embedded context.
 */
function ensureStats(jobId: string, context?: StatsContext): JobStats | undefined {
  let stats = jobStatsMap.get(jobId);
  if (!stats && context) {
    stats = {
      pagesFound: context.pagesFound,
      pagesScreenshotted: 0,
      pagesFailed: 0,
      viewports: context.viewportCount,
      url: context.url,
      startedAt: Date.now(),
    };
    jobStatsMap.set(jobId, stats);
    logger.info({ jobId, pagesFound: context.pagesFound, viewports: context.viewportCount },
      'Lazy-initialized job stats from screenshot job data (worker restart recovery)');
  }
  return stats;
}

export function incrementScreenshotted(jobId: string, context?: StatsContext): void {
  const stats = ensureStats(jobId, context);
  if (stats) {
    stats.pagesScreenshotted++;
  } else {
    logger.warn({ jobId }, 'incrementScreenshotted: jobId not in stats map and no context to recover');
  }
}

export function incrementFailed(jobId: string, context?: StatsContext): void {
  const stats = ensureStats(jobId, context);
  if (stats) {
    stats.pagesFailed++;
  }
}

export function getJobStats(jobId: string): JobStats {
  return jobStatsMap.get(jobId) || {
    pagesFound: 0,
    pagesScreenshotted: 0,
    pagesFailed: 0,
    viewports: 2,
    url: '',
    startedAt: Date.now(),
  };
}

export function getActiveJobs(): string[] {
  return Array.from(jobStatsMap.keys());
}

export function removeJobStats(jobId: string): void {
  jobStatsMap.delete(jobId);
}

export function broadcastToJob(jobId: string, data: Record<string, unknown>): void {
  try {
    const redis = getRedisConnection();
    const channel = `job:${jobId}:events`;
    redis.publish(channel, JSON.stringify(data)).catch((err: Error) => {
      logger.error({ jobId, error: err.message }, 'Publish failed');
    });
  } catch (error) {
    logger.error({ jobId, error: String(error) }, 'Failed to broadcast event');
  }
}
