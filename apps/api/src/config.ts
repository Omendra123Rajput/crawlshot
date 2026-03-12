import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('3001').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  SCREENSHOT_PATH: z.string().default('/tmp/screenshots'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  MAX_ZIP_SIZE_MB: z.string().default('500').transform(Number),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Invalid environment variables:', result.error.format());
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();
