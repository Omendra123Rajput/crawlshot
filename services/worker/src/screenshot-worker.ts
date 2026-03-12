import { Worker, type Job, type ConnectionOptions } from 'bullmq';
import { getRedisConnection, type ScreenshotJobData, getScreenshotQueue } from '@screenshot-crawler/queue';
import { ScreenshotEngine } from '@screenshot-crawler/screenshot-engine';
import { packageJob } from '@screenshot-crawler/storage';
import { logger, QUEUE_NAMES, SCREENSHOT_CONCURRENCY } from '@screenshot-crawler/utils';
import { broadcastToJob, getJobStats, incrementScreenshotted, incrementFailed, setJobPagesFound, getActiveJobs, removeJobStats } from './broadcast';

const engine = new ScreenshotEngine();

export function startScreenshotWorker(): Worker<ScreenshotJobData> {
  const worker = new Worker<ScreenshotJobData>(
    QUEUE_NAMES.SCREENSHOT,
    async (job: Job<ScreenshotJobData>) => {
      const { jobId, url, viewport, outputDir } = job.data;
      const log = logger.child({ jobId, url, viewport });

      log.debug('Screenshot job started');

      try {
        await engine.initialize();
        const outputPath = await engine.capture(url, viewport, outputDir);
        incrementScreenshotted(jobId);

        const stats = getJobStats(jobId);
        broadcastToJob(jobId, {
          event: 'progress',
          status: 'capturing',
          pagesFound: stats.pagesFound,
          pagesScreenshotted: stats.pagesScreenshotted,
        });

        log.debug({ outputPath }, 'Screenshot captured');
        return { outputPath };
      } catch (error) {
        incrementFailed(jobId);
        const err = error instanceof Error ? error : new Error(String(error));
        log.error({ error: err.message }, 'Screenshot capture failed');
        throw err;
      }
    },
    {
      connection: getRedisConnection() as unknown as ConnectionOptions,
      concurrency: SCREENSHOT_CONCURRENCY,
    }
  );

  worker.on('failed', (job, err) => {
    if (job) {
      logger.warn(
        { jobId: job.data.jobId, url: job.data.url, error: err.message },
        'Screenshot job failed'
      );
    }
  });

  // Check if all screenshots for a job are done
  setInterval(async () => {
    try {
      const queue = getScreenshotQueue();
      const activeJobs = getActiveJobs();

      for (const jobId of activeJobs) {
        const stats = getJobStats(jobId);
        const totalExpected = stats.pagesFound * stats.viewports;

        if (totalExpected > 0 && stats.pagesScreenshotted + stats.pagesFailed >= totalExpected) {
          logger.info({ jobId, stats }, 'All screenshots done, packaging');
          broadcastToJob(jobId, {
            event: 'progress',
            status: 'packaging',
            pagesFound: stats.pagesFound,
            pagesScreenshotted: stats.pagesScreenshotted,
          });

          try {
            const domain = new URL(stats.url).hostname;
            const zipPath = await packageJob(jobId, domain);
            broadcastToJob(jobId, {
              event: 'complete',
              downloadUrl: `/api/jobs/${jobId}/download`,
            });
            removeJob(jobId);
          } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger.error({ jobId, error: err.message }, 'ZIP packaging failed');
            broadcastToJob(jobId, {
              event: 'error',
              message: `Packaging failed: ${err.message}`,
            });
            removeJob(jobId);
          }
        }
      }
    } catch (error) {
      logger.error({ error: String(error) }, 'Completion check error');
    }
  }, 2000);

  return worker;
}

function removeJob(jobId: string): void {
  removeJobStats(jobId);
}
