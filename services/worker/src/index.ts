import { logger } from '@screenshot-crawler/utils';
import { getRedisConnection, getCrawlQueue, getScreenshotQueue } from '@screenshot-crawler/queue';
import { startCrawlWorker } from './crawl-worker';
import { startScreenshotWorker } from './screenshot-worker';

async function main() {
  logger.info('Starting worker process');

  // Ensure Redis is connected
  const redis = getRedisConnection();
  await new Promise<void>((resolve) => {
    if (redis.status === 'ready') {
      resolve();
    } else {
      redis.once('ready', resolve);
    }
  });
  logger.info('Redis connected');

  // Start workers
  const crawlWorker = startCrawlWorker();
  const screenshotWorker = startScreenshotWorker();

  logger.info('All workers started');

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down workers...');
    await crawlWorker.close();
    await screenshotWorker.close();
    await redis.quit();
    logger.info('Workers shut down');
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error) => {
  logger.error({ error: String(error) }, 'Worker process crashed');
  process.exit(1);
});
