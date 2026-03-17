import { Worker, type Job, type ConnectionOptions } from 'bullmq';
import { getRedisConnection, type CrawlJobData, addScreenshotJob } from '@screenshot-crawler/queue';
import { crawlSite } from '@screenshot-crawler/crawler';
import { getJobOutputDir } from '@screenshot-crawler/storage';
import { logger, QUEUE_NAMES, CRAWL_CONCURRENCY } from '@screenshot-crawler/utils';
import { broadcastToJob, initJobStats, setJobPagesFound } from './broadcast';

export function startCrawlWorker(): Worker<CrawlJobData> {
  const worker = new Worker<CrawlJobData>(
    QUEUE_NAMES.CRAWL,
    async (job: Job<CrawlJobData>) => {
      const { jobId, url, viewports, maxDepth } = job.data;
      const log = logger.child({ jobId, url, maxDepth });

      log.info('Crawl job started');
      initJobStats(jobId, url, viewports.length);
      broadcastToJob(jobId, { event: 'progress', status: 'crawling', pagesFound: 0, pagesScreenshotted: 0 });

      const outputDir = await getJobOutputDir(jobId);
      let pagesFound = 0;

      const pages = await crawlSite(jobId, url, (foundUrl) => {
        pagesFound++;
        broadcastToJob(jobId, {
          event: 'progress',
          status: 'crawling',
          pagesFound,
          pagesScreenshotted: 0,
        });
      }, { maxDepth: maxDepth ?? -1 });

      log.info({ totalPages: pages.length }, 'Crawl complete, queuing screenshots');
      setJobPagesFound(jobId, pages.length);
      broadcastToJob(jobId, {
        event: 'progress',
        status: 'capturing',
        pagesFound: pages.length,
        pagesScreenshotted: 0,
        totalExpected: pages.length * viewports.length,
      });

      // Queue screenshot jobs for each page + viewport
      // Include pagesFound/viewportCount so stats can be rebuilt after worker restart
      for (const pageUrl of pages) {
        for (const viewport of viewports) {
          await addScreenshotJob({
            jobId,
            url: pageUrl,
            viewport: viewport as 'desktop' | 'mobile',
            outputDir,
            pagesFound: pages.length,
            viewportCount: viewports.length,
          });
        }
      }

      return { pagesFound: pages.length, viewports };
    },
    {
      connection: getRedisConnection() as unknown as ConnectionOptions,
      concurrency: CRAWL_CONCURRENCY,
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.data.jobId }, 'Crawl job completed');
  });

  worker.on('failed', (job, err) => {
    if (job) {
      logger.error({ jobId: job.data.jobId, error: err.message }, 'Crawl job failed');
      broadcastToJob(job.data.jobId, {
        event: 'error',
        message: `Crawl failed: ${err.message}`,
      });
    }
  });

  return worker;
}
