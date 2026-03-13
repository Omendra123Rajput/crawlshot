import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { validateBody } from '../middleware/validate';
import { jobCreationLimiter } from '../middleware/rate-limit';
import { createJob, getJob, getAllJobs } from '../services/job-store';
import { watchJob } from '../services/sse-broadcaster';
import { addCrawlJob } from '@screenshot-crawler/queue';
import { guardUrl } from '@screenshot-crawler/crawler';
import { MAX_URL_LENGTH } from '@screenshot-crawler/utils';

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
    const { url, viewports } = req.body as z.infer<typeof createJobSchema>;

    try {
      // SSRF guard
      await guardUrl(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'URL validation failed';
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
    await addCrawlJob({ jobId, url, viewports });

    res.status(201).json({
      jobId: job.jobId,
      status: job.status,
      createdAt: job.createdAt,
    });
  })
);

// GET /api/jobs/:jobId
router.get('/:jobId', asyncHandler(async (req: Request, res: Response) => {
  const job = getJob(req.params.jobId);
  res.json(job);
}));

// GET /api/jobs
router.get('/', (_req: Request, res: Response) => {
  const jobs = getAllJobs();
  res.json(jobs);
});

export default router;
