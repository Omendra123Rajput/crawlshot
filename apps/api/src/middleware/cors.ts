import cors from 'cors';
import { config } from '../config';
import { logger } from '@screenshot-crawler/utils';

// Strip any accidental quotes from env var and split by comma
const allowedOrigins = config.ALLOWED_ORIGINS
  .replace(/^["']|["']$/g, '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const isWildcard = allowedOrigins.includes('*');

if (isWildcard) {
  logger.warn('CORS configured with wildcard (*) — credentials disabled for security');
}

logger.info({ allowedOrigins }, 'CORS allowed origins configured');

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, server-to-server, proxied)
    if (!origin) {
      callback(null, true);
      return;
    }

    // Wildcard allows all
    if (isWildcard) {
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
  // Never send credentials with wildcard — browsers reject it and it signals misconfiguration
  credentials: !isWildcard,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
