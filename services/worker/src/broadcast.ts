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

export function incrementScreenshotted(jobId: string): void {
  const stats = jobStatsMap.get(jobId);
  if (stats) {
    stats.pagesScreenshotted++;
  }
}

export function incrementFailed(jobId: string): void {
  const stats = jobStatsMap.get(jobId);
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
    redis.publish(channel, JSON.stringify(data));
  } catch (error) {
    logger.error({ jobId, error: String(error) }, 'Failed to broadcast event');
  }
}
