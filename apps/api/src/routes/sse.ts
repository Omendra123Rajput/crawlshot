import { Router, type Request, type Response, type NextFunction } from 'express';
import { subscribeToJob } from '../services/sse-broadcaster';
import { getJob, jobExists } from '../services/job-store';
import { validateJobId } from '../middleware/validate';

const router = Router();

// GET /api/jobs/:jobId/stream
router.get('/:jobId/stream', validateJobId, (req: Request, res: Response, next: NextFunction) => {
  const { jobId } = req.params;

  // Verify job exists
  if (!jobExists(jobId)) {
    res.status(404).json({ error: { code: 'JOB_NOT_FOUND', message: `Job not found: ${jobId}` } });
    return;
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // IMPORTANT: Subscribe FIRST, then send current state.
  // This prevents a race condition where events are lost between
  // reading the job state and subscribing to future events.
  // Any duplicate events are harmless — the frontend just updates to latest values.
  const unsubscribe = subscribeToJob(jobId, res);

  // Now read current state (which includes any events that arrived during subscription setup)
  const job = getJob(jobId);
  const totalExpected = job.stats.pagesFound * job.viewports.length;
  const initialEvent = {
    event: 'progress' as const,
    status: job.status,
    pagesFound: job.stats.pagesFound,
    pagesScreenshotted: job.stats.pagesScreenshotted,
    totalExpected,
    ...(job.downloadUrl ? { downloadUrl: job.downloadUrl } : {}),
  };
  res.write(`data: ${JSON.stringify(initialEvent)}\n\n`);

  // If job is already complete or failed, send terminal event and close
  if (job.status === 'completed' || job.status === 'failed') {
    if (job.status === 'completed') {
      res.write(`data: ${JSON.stringify({ event: 'complete', downloadUrl: job.downloadUrl })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ event: 'error', message: job.error })}\n\n`);
    }
    res.end();
    unsubscribe();
    return;
  }

  // Keep-alive ping every 30 seconds
  const keepAlive = setInterval(() => {
    res.write(': ping\n\n');
  }, 30_000);

  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
});

export default router;
