import rateLimit from 'express-rate-limit';
import { logger } from '@screenshot-crawler/utils';

export const jobCreationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, try again later' } },
  handler: (req, res, _next, options) => {
    logger.warn({ ip: req.ip, path: req.path }, 'Job creation rate limit hit');
    res.status(options.statusCode).json(options.message);
  },
});

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

/** Stricter limiter for file-serving endpoints (screenshots, downloads) */
export const downloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60, // 60 file requests per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many download requests, try again later' } },
  handler: (req, res, _next, options) => {
    logger.warn({ ip: req.ip, path: req.path }, 'Download rate limit hit');
    res.status(options.statusCode).json(options.message);
  },
});
