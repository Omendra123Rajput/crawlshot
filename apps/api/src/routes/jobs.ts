import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { validateBody, validateJobId } from '../middleware/validate';
import { jobCreationLimiter } from '../middleware/rate-limit';
import { createJob, getJob } from '../services/job-store';
import { watchJob } from '../services/sse-broadcaster';
import { addCrawlJob } from '@screenshot-crawler/queue';
import { guardUrl } from '@screenshot-crawler/crawler';
import { logger, MAX_URL_LENGTH } from '@screenshot-crawler/utils';

const router = Router();

const createJobSchema = z.object({
  url: z
    .string()
    .url('Must be a valid URL')
    .max(MAX_URL_LENGTH, `URL must be at most ${MAX_URL_LENGTH} characters`)
    .refine((url) => url.startsWith('https://'), 'URL must use HTTPS'),
  viewports: z
    .array(z.enum(['desktop', 'mobile']))
    .min(1, 'At least one viewport required')
    .default(['desktop', 'mobile']),
  maxDepth: z
    .number()
    .int()
    .min(-1)
    .max(10)
    .default(-1),
});

// Async route wrapper for Express 4 (catches async errors and forwards to error handler)
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// POST /api/jobs
router.post(
  '/',
  jobCreationLimiter,
  validateBody(createJobSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { url, viewports, maxDepth } = req.body as z.infer<typeof createJobSchema>;

    try {
      // SSRF guard
      await guardUrl(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'URL validation failed';
      logger.warn({ ip: req.ip, url, reason: message }, 'SSRF guard blocked URL');
      res.status(403).json({
        error: { code: 'URL_BLOCKED', message },
      });
      return;
    }

    const jobId = uuidv4();
    const job = createJob(jobId, url, viewports);

    // Subscribe to worker events immediately so job store stays in sync
    watchJob(jobId);

    // Queue the crawl job
    await addCrawlJob({ jobId, url, viewports, maxDepth });

    res.status(201).json({
      jobId: job.jobId,
      status: job.status,
      createdAt: job.createdAt,
    });
  })
);

// GET /api/jobs/:jobId
router.get('/:jobId', validateJobId, asyncHandler(async (req: Request, res: Response) => {
  const job = getJob(req.params.jobId);
  res.json(job);
}));

export default router;
