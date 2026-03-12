import { type Request, type Response, type NextFunction } from 'express';
import { logger } from '@screenshot-crawler/utils';
import { AppError } from '../types';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    logger.warn(
      { code: err.code, statusCode: err.statusCode, message: err.message, path: req.path },
      'Application error'
    );

    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  // CORS errors
  if (err.message.includes('not allowed by CORS')) {
    res.status(403).json({
      error: { code: 'CORS_BLOCKED', message: err.message },
    });
    return;
  }

  logger.error(
    { error: err.message, stack: err.stack, path: req.path },
    'Unhandled error'
  );

  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
}
