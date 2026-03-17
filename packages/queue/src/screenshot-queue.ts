import { Queue, type ConnectionOptions } from 'bullmq';
import { getRedisConnection } from './redis-connection';
import { QUEUE_NAMES } from '@screenshot-crawler/utils';

export interface ScreenshotJobData {
  jobId: string;
  url: string;
  viewport: 'desktop' | 'mobile';
  outputDir: string;
  pagesFound?: number;
  viewportCount?: number;
}

let screenshotQueue: Queue | null = null;

export function getScreenshotQueue(): Queue {
  if (!screenshotQueue) {
    screenshotQueue = new Queue(QUEUE_NAMES.SCREENSHOT, {
      connection: getRedisConnection() as unknown as ConnectionOptions,
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });
  }
  return screenshotQueue;
}

export async function addScreenshotJob(data: ScreenshotJobData): Promise<string> {
  const queue = getScreenshotQueue();
  const job = await queue.add('screenshot', data);
  return job.id as string;
}
