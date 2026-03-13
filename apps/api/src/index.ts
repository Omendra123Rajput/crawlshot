import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { config } from './config';
import { corsMiddleware } from './middleware/cors';
import { generalLimiter } from './middleware/rate-limit';
import { errorHandler } from './middleware/error-handler';
import { initSSESubscriber, closeSSESubscriber } from './services/sse-broadcaster';
import { logger } from '@screenshot-crawler/utils';
import jobsRouter from './routes/jobs';
import sseRouter from './routes/sse';
import downloadRouter from './routes/download';

const app = express();

// Security middleware
app.use(helmet());
app.use(corsMiddleware);
app.use(generalLimiter);
app.use(express.json({ limit: '10kb' }));
app.use(pinoHttp({ logger }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/jobs', jobsRouter);
app.use('/api/jobs', sseRouter);
app.use('/api/jobs', downloadRouter);

// Error handler (must be last)
app.use(errorHandler);

// Initialize SSE subscriber
initSSESubscriber(config.REDIS_URL);

// Start server
const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, 'API server started');
});

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down API server...');
  await closeSSESubscriber();
  server.close(() => {
    logger.info('API server stopped');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Prevent process crashes from unhandled errors
process.on('unhandledRejection', (reason) => {
  logger.error({ reason: String(reason) }, 'Unhandled rejection — NOT crashing');
});
process.on('uncaughtException', (err) => {
  logger.error({ error: err.message, stack: err.stack }, 'Uncaught exception — NOT crashing');
});

export default app;
