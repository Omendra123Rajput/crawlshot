import cors from 'cors';
import { config } from '../config';
import { logger } from '@screenshot-crawler/utils';

// Strip any accidental quotes from env var and split by comma
const allowedOrigins = config.ALLOWED_ORIGINS
  .replace(/^["']|["']$/g, '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

logger.info({ allowedOrigins }, 'CORS allowed origins configured');

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, server-to-server, proxied)
    if (!origin) {
      callback(null, true);
      return;
    }

    // Wildcard allows all
    if (allowedOrigins.includes('*')) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn({ origin, allowedOrigins }, 'CORS blocked request');
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
