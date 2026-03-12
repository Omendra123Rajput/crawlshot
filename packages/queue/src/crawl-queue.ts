import { Queue, type ConnectionOptions } from 'bullmq';
import { getRedisConnection } from './redis-connection';
import { QUEUE_NAMES } from '@screenshot-crawler/utils';

export interface CrawlJobData {
  jobId: string;
  url: string;
  viewports: string[];
}

let crawlQueue: Queue | null = null;

export function getCrawlQueue(): Queue {
  if (!crawlQueue) {
    crawlQueue = new Queue(QUEUE_NAMES.CRAWL, {
      connection: getRedisConnection() as unknown as ConnectionOptions,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });
  }
  return crawlQueue;
}

export async function addCrawlJob(data: CrawlJobData): Promise<string> {
  const queue = getCrawlQueue();
  const job = await queue.add('crawl', data, { jobId: data.jobId });
  return job.id as string;
}
