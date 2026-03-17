import { type Request, type Response, type NextFunction } from 'express';
import { type ZodSchema, ZodError } from 'zod';
import { logger } from '@screenshot-crawler/utils';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reject requests where :jobId is not a valid UUID v4 */
export function validateJobId(req: Request, res: Response, next: NextFunction): void {
  const { jobId } = req.params;
  if (!jobId || !UUID_RE.test(jobId)) {
    logger.warn({ ip: req.ip, jobId, path: req.path }, 'Invalid jobId format rejected');
    res.status(400).json({
      error: { code: 'INVALID_JOB_ID', message: 'jobId must be a valid UUID' },
    });
    return;
  }
  next();
}

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: error.errors.map((e) => ({
              path: e.path.join('.'),
              message: e.message,
            })),
          },
        });
        return;
      }
      next(error);
    }
  };
}
