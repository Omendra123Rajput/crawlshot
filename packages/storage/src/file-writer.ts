import fs from 'fs/promises';
import path from 'path';
import { logger } from '@screenshot-crawler/utils';

const screenshotPath = process.env.SCREENSHOT_PATH || '/tmp/screenshots';

export function getScreenshotBasePath(): string {
  return screenshotPath;
}

export async function saveScreenshot(
  jobId: string,
  viewport: string,
  filename: string,
  data: Buffer
): Promise<string> {
  const outputDir = path.resolve(screenshotPath, jobId, viewport);

  // Path traversal guard
  if (!outputDir.startsWith(path.resolve(screenshotPath))) {
    throw new Error(`Path traversal detected: ${outputDir}`);
  }

  await fs.mkdir(outputDir, { recursive: true });

  const filePath = path.resolve(outputDir, filename);

  // Double-check resolved path
  if (!filePath.startsWith(path.resolve(screenshotPath))) {
    throw new Error(`Path traversal detected in filename: ${filename}`);
  }

  // Atomic write: write to temp file then rename
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, data);
  await fs.rename(tempPath, filePath);

  logger.debug({ filePath }, 'Screenshot saved');
  return filePath;
}

export async function getJobOutputDir(jobId: string): Promise<string> {
  const dir = path.resolve(screenshotPath, jobId);

  if (!dir.startsWith(path.resolve(screenshotPath))) {
    throw new Error(`Path traversal detected: ${dir}`);
  }

  await fs.mkdir(dir, { recursive: true });
  return dir;
}
