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
          setJobStatus(jobId, data.status);
        }
        if (data.pagesFound !== undefined || data.pagesScreenshotted !== undefined) {
          updateJobStats(jobId, {
            pagesFound: data.pagesFound,
            pagesScreenshotted: data.pagesScreenshotted,
          });
        }
        if (data.event === 'complete' && data.downloadUrl) {
          updateJob(jobId, { status: 'completed', downloadUrl: data.downloadUrl });
        }
        if (data.event === 'error' && data.message) {
          updateJob(jobId, { status: 'failed', error: data.message });
        }
      }

      // Broadcast to SSE clients
      broadcastToClients(jobId, data);
    } catch (error) {
      logger.error({ channel, error: String(error) }, 'Failed to process SSE event');
    }
  });

  subscriber.on('error', (err) => {
    logger.error({ error: err.message }, 'SSE subscriber Redis error');
  });
}

export function subscribeToJob(jobId: string, res: Response): () => void {
  const client: SSEClient = { res, jobId };

  if (!clients.has(jobId)) {
    clients.set(jobId, new Set());
    // Subscribe to Redis channel for this job
    subscriber?.subscribe(`job:${jobId}:events`);
  }

  clients.get(jobId)!.add(client);

  logger.debug({ jobId, clientCount: clients.get(jobId)!.size }, 'SSE client subscribed');

  // Return cleanup function
  return () => {
    const jobClients = clients.get(jobId);
    if (jobClients) {
      jobClients.delete(client);
      if (jobClients.size === 0) {
        clients.delete(jobId);
        subscriber?.unsubscribe(`job:${jobId}:events`);
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
