import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import archiver from 'archiver';
import { logger } from '@screenshot-crawler/utils';

export class ZipSizeLimitError extends Error {
  public readonly currentSizeMb: number;
  public readonly limitMb: number;

  constructor(currentSizeMb: number, limitMb: number) {
    super(`ZIP size ${currentSizeMb}MB exceeds limit of ${limitMb}MB`);
    this.name = 'ZipSizeLimitError';
    this.currentSizeMb = currentSizeMb;
    this.limitMb = limitMb;
  }
}

const maxZipSizeMb = parseInt(process.env.MAX_ZIP_SIZE_MB || '500', 10);

export async function packageJob(jobId: string, domain: string): Promise<string> {
  const screenshotPath = process.env.SCREENSHOT_PATH || '/tmp/screenshots';
  const jobDir = path.resolve(screenshotPath, jobId);
  const zipFilename = `${domain}-screenshots.zip`;
  const zipPath = path.resolve(jobDir, zipFilename);

  // Ensure job directory exists
  if (!jobDir.startsWith(path.resolve(screenshotPath))) {
    throw new Error(`Path traversal detected: ${jobDir}`);
  }

  logger.info({ jobId, domain, zipPath }, 'Starting ZIP packaging');

  return new Promise<string>((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 6 } });

    let totalBytes = 0;
    const maxBytes = maxZipSizeMb * 1024 * 1024;

    archive.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        archive.abort();
        reject(new ZipSizeLimitError(Math.round(totalBytes / 1024 / 1024), maxZipSizeMb));
      }
    });

    output.on('close', () => {
      logger.info(
        { jobId, sizeMb: Math.round(archive.pointer() / 1024 / 1024), zipPath },
        'ZIP packaging complete'
      );
      resolve(zipPath);
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);

    // Add desktop and mobile directories
    const desktopDir = path.join(jobDir, 'desktop');
    const mobileDir = path.join(jobDir, 'mobile');

    const addDirIfExists = async (dir: string, prefix: string) => {
      try {
        await fsp.access(dir);
        archive.directory(dir, prefix);
      } catch {
        // Directory doesn't exist, skip
      }
    };

    Promise.all([
      addDirIfExists(desktopDir, 'desktop'),
      addDirIfExists(mobileDir, 'mobile'),
    ]).then(() => {
      archive.finalize();
    }).catch(reject);
  });
}
