import { describe, it, expect, vi, afterAll, beforeAll } from 'vitest';
import request from 'supertest';

// Mock modules BEFORE importing app to prevent side effects

// Mock config to use port 0 (OS-assigned random port) so app.listen() never conflicts
vi.mock('../config', () => ({
  config: {
    PORT: 0,
    NODE_ENV: 'test',
    REDIS_URL: 'redis://localhost:6379',
    SCREENSHOT_PATH: '/tmp/screenshots',
    ALLOWED_ORIGINS: 'http://localhost:3000',
    MAX_ZIP_SIZE_MB: 500,
  },
}));

// Mock SSE broadcaster to prevent Redis subscriber from being created
vi.mock('../services/sse-broadcaster', () => ({
  initSSESubscriber: vi.fn(),
  closeSSESubscriber: vi.fn().mockResolvedValue(undefined),
  subscribeToJob: vi.fn(),
}));

// Mock queue to prevent real BullMQ/Redis connection
vi.mock('@screenshot-crawler/queue', () => ({
  addCrawlJob: vi.fn().mockResolvedValue({ id: 'mock-queue-id' }),
  crawlQueue: {},
  screenshotQueue: {},
}));

// Mock SSRF guard so no real DNS resolution happens in tests
vi.mock('@screenshot-crawler/crawler', () => ({
  guardUrl: vi.fn().mockResolvedValue(undefined),
  normalizeUrl: vi.fn((url: string) => url),
  RobotsParser: vi.fn(),
  discoverLinks: vi.fn(),
}));

// Mock @screenshot-crawler/utils to suppress logger output during tests
// Use a real pino silent logger so pino-http middleware receives a compatible logger instance
vi.mock('@screenshot-crawler/utils', async () => {
  const pino = (await import('pino')).default;
  return {
    logger: pino({ level: 'silent' }),
    MAX_URL_LENGTH: 2048,
    TIMEOUTS: {},
    CONCURRENCY: {},
    VIEWPORTS: {},
    retry: vi.fn(),
  };
});

// Import app AFTER mocks are set up
import app from '../index';
import { addCrawlJob } from '@screenshot-crawler/queue';
import { jobCreationLimiter } from '../middleware/rate-limit';

// Close any open handles after all tests
afterAll(async () => {
  // Allow server to close gracefully
  await new Promise<void>((resolve) => setTimeout(resolve, 100));
});

describe('POST /api/jobs - validation (SECR-03)', () => {
  it('returns 400 with VALIDATION_ERROR when body is empty', async () => {
    const res = await request(app).post('/api/jobs').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 with VALIDATION_ERROR when url is not a valid URL string', async () => {
    const res = await request(app).post('/api/jobs').send({ url: 'not-a-url' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 with VALIDATION_ERROR when url uses HTTP (not HTTPS)', async () => {
    const res = await request(app).post('/api/jobs').send({ url: 'http://example.com' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 with VALIDATION_ERROR when viewports array is empty', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .send({ url: 'https://example.com', viewports: [] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 with VALIDATION_ERROR when viewports contains invalid enum value', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .send({ url: 'https://example.com', viewports: ['tablet'] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('includes a details array with path and message on validation error', async () => {
    const res = await request(app).post('/api/jobs').send({});
    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.error.details)).toBe(true);
    expect(res.body.error.details.length).toBeGreaterThan(0);
    const detail = res.body.error.details[0];
    expect(typeof detail.path).toBe('string');
    expect(typeof detail.message).toBe('string');
  });

  it('error response for HTTP URL details should mention HTTPS', async () => {
    const res = await request(app).post('/api/jobs').send({ url: 'http://example.com' });
    expect(res.status).toBe(400);
    const details: Array<{ path: string; message: string }> = res.body.error.details;
    const httpsDetail = details.find((d) =>
      d.message.toLowerCase().includes('https')
    );
    expect(httpsDetail).toBeDefined();
  });
});

describe('Rate limiter config (SECR-04)', () => {
  it('jobCreationLimiter is defined and is a function (middleware)', () => {
    // Config verified by source inspection: 20 req / 15 min (windowMs: 900000, max: 20)
    // Verifying via source: apps/api/src/middleware/rate-limit.ts
    expect(jobCreationLimiter).toBeDefined();
    expect(typeof jobCreationLimiter).toBe('function');
  });

  it('jobCreationLimiter is applied to POST /api/jobs route', async () => {
    // The rate limiter sets X-RateLimit-Limit header on responses
    const res = await request(app)
      .post('/api/jobs')
      .send({ url: 'https://example.com' });
    // Rate limit header should be present (standardHeaders: true)
    // It may be 201 (success) or 429 (if limits hit during test runs) — just check header exists
    expect(res.headers['ratelimit-limit'] ?? res.headers['x-ratelimit-limit']).toBeDefined();
  });
});

describe('POST /api/jobs - success (PIPE-01)', () => {
  beforeAll(() => {
    // Reset mock call history before success tests
    vi.mocked(addCrawlJob).mockClear();
  });

  it('returns 201 for a valid HTTPS URL', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .send({ url: 'https://example.com' });
    expect(res.status).toBe(201);
  });

  it('response body contains jobId as a string', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .send({ url: 'https://example.com' });
    expect(res.status).toBe(201);
    expect(typeof res.body.jobId).toBe('string');
    expect(res.body.jobId.length).toBeGreaterThan(0);
  });

  it('response body contains status as a string', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .send({ url: 'https://example.com' });
    expect(res.status).toBe(201);
    expect(typeof res.body.status).toBe('string');
  });

  it('response body contains createdAt as a string', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .send({ url: 'https://example.com' });
    expect(res.status).toBe(201);
    expect(typeof res.body.createdAt).toBe('string');
  });

  it('default viewports are applied — addCrawlJob called with desktop and mobile', async () => {
    vi.mocked(addCrawlJob).mockClear();
    const res = await request(app)
      .post('/api/jobs')
      .send({ url: 'https://example.com' });
    expect(res.status).toBe(201);
    expect(addCrawlJob).toHaveBeenCalledOnce();
    const callArg = vi.mocked(addCrawlJob).mock.calls[0][0];
    expect(callArg.viewports).toEqual(['desktop', 'mobile']);
  });
});
