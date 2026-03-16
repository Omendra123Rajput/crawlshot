import { type Response } from 'express';
import IORedis from 'ioredis';
import { logger } from '@screenshot-crawler/utils';
import { type SSEEvent, type JobStatus } from '../types';
import { updateJobStats, setJobStatus, updateJob, jobExists } from './job-store';

type SSEClient = {
  res: Response;
  jobId: string;
};

const clients = new Map<string, Set<SSEClient>>();
// Track channels we've subscribed to (for job store updates even without SSE clients)
const subscribedChannels = new Set<string>();
let subscriber: IORedis | null = null;

export function initSSESubscriber(redisUrl: string): void {
  subscriber = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  subscriber.on('message', (channel: string, message: string) => {
    // Channel format: job:{jobId}:events
    const match = channel.match(/^job:(.+):events$/);
    if (!match) return;

    const jobId = match[1];

    try {
      const data = JSON.parse(message) as SSEEvent;

      // Update job store
      if (jobExists(jobId)) {
        if (data.status) {
          setJobStatus(jobId, data.status as JobStatus);
        }
        // Only update stats that are actually present (avoid overwriting with undefined)
        const statsUpdate: Record<string, number> = {};
        if (data.pagesFound !== undefined) statsUpdate.pagesFound = data.pagesFound;
        if (data.pagesScreenshotted !== undefined) statsUpdate.pagesScreenshotted = data.pagesScreenshotted;
        if (Object.keys(statsUpdate).length > 0) {
          updateJobStats(jobId, statsUpdate);
        }
        if (data.event === 'complete' && data.downloadUrl) {
          updateJob(jobId, { status: 'completed', downloadUrl: data.downloadUrl as string });
        }
        if (data.event === 'error' && data.message) {
          updateJob(jobId, { status: 'failed', error: data.message as string });
        }
      }

      // Broadcast to SSE clients
      broadcastToClients(jobId, data);

      // Auto-unsubscribe on terminal events (if no SSE clients remain)
      if (data.event === 'complete' || data.event === 'error') {
        const jobClients = clients.get(jobId);
        if (!jobClients || jobClients.size === 0) {
          subscriber?.unsubscribe(channel);
          subscribedChannels.delete(channel);
        }
      }
    } catch (error) {
      logger.error({ channel, error: String(error) }, 'Failed to process SSE event');
    }
  });

  subscriber.on('error', (err) => {
    logger.error({ error: err.message }, 'SSE subscriber Redis error');
  });
}

/**
 * Subscribe to a job's Redis Pub/Sub channel immediately (called at job creation).
 * Ensures the API job store stays in sync with worker events even before any SSE client connects.
 */
export function watchJob(jobId: string): void {
  const channel = `job:${jobId}:events`;
  if (!subscribedChannels.has(channel)) {
    subscribedChannels.add(channel);
    subscriber?.subscribe(channel);
    logger.debug({ jobId }, 'Watching job channel for store updates');
  }
}

export function subscribeToJob(jobId: string, res: Response): () => void {
  const client: SSEClient = { res, jobId };

  if (!clients.has(jobId)) {
    clients.set(jobId, new Set());
  }

  // Ensure we're subscribed to the Redis channel
  watchJob(jobId);

  clients.get(jobId)!.add(client);

  logger.debug({ jobId, clientCount: clients.get(jobId)!.size }, 'SSE client subscribed');

  // Return cleanup function
  return () => {
    const jobClients = clients.get(jobId);
    if (jobClients) {
      jobClients.delete(client);
      if (jobClients.size === 0) {
        clients.delete(jobId);
        // Don't unsubscribe from Redis here — watchJob keeps it alive for job store updates
      }
    }
    logger.debug({ jobId }, 'SSE client disconnected');
  };
}

function broadcastToClients(jobId: string, data: SSEEvent): void {
  const jobClients = clients.get(jobId);
  if (!jobClients) return;

  const message = `data: ${JSON.stringify(data)}\n\n`;

  for (const client of jobClients) {
    try {
      client.res.write(message);
    } catch {
      jobClients.delete(client);
    }
  }
}

export async function closeSSESubscriber(): Promise<void> {
  if (subscriber) {
    await subscriber.quit();
    subscriber = null;
  }
}
