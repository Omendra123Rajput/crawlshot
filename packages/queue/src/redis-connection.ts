import IORedis from 'ioredis';
import { logger } from '@screenshot-crawler/utils';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export function createRedisConnection(): IORedis {
  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times: number) {
      const delay = Math.min(times * 200, 5000);
      logger.warn({ attempt: times, delay }, 'Redis reconnecting');
      return delay;
    },
  });

  connection.on('connect', () => {
    logger.info('Redis connected');
  });

  connection.on('error', (err: Error) => {
    logger.error({ err: err.message }, 'Redis connection error');
  });

  return connection;
}

let sharedConnection: IORedis | null = null;

export function getRedisConnection(): IORedis {
  if (!sharedConnection) {
    sharedConnection = createRedisConnection();
  }
  return sharedConnection;
}

export async function closeRedisConnection(): Promise<void> {
  if (sharedConnection) {
    await sharedConnection.quit();
    sharedConnection = null;
  }
}
