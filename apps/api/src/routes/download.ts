import { Router, type Request, type Response, type NextFunction } from 'express';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { getJob, jobExists } from '../services/job-store';
import { logger } from '@screenshot-crawler/utils';

const router = Router();

const screenshotPath = process.env.SCREENSHOT_PATH || '/tmp/screenshots';

// Express 4 async wrapper — catches rejected promises and forwards to error handler
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// GET /api/jobs/:jobId/screenshots — list available screenshot files
router.get('/:jobId/screenshots', asyncHandler(async (req: Request, res: Response) => {
  const { jobId } = req.params;

  if (!jobExists(jobId)) {
    res.status(404).json({ error: { code: 'JOB_NOT_FOUND', message: 'Job not found' } });
    return;
  }

  const jobDir = path.resolve(screenshotPath, jobId);
  if (!jobDir.startsWith(path.resolve(screenshotPath))) {
    res.status(403).json({ error: { code: 'PATH_TRAVERSAL', message: 'Invalid path' } });
    return;
  }

  try {
    const screenshots: Array<{ viewport: string; filename: string; url: string }> = [];

    for (const viewport of ['desktop', 'mobile']) {
      const vpDir = path.join(jobDir, viewport);
      try {
        const files = await fsp.readdir(vpDir);
        for (const file of files) {
          if (file.endsWith('.png') && !file.endsWith('.tmp')) {
            screenshots.push({
              viewport,
              filename: file,
              url: `/api/jobs/${jobId}/screenshots/${viewport}/${file}`,
            });
          }
        }
      } catch {
        // Directory doesn't exist yet — skip
      }
    }

    res.json({ screenshots });
  } catch (error) {
    logger.error({ jobId, error: String(error) }, 'Failed to list screenshots');
    res.status(500).json({ error: { code: 'LIST_ERROR', message: 'Failed to list screenshots' } });
  }
}));

// GET /api/jobs/:jobId/screenshots/:viewport/:filename — serve individual screenshot
router.get('/:jobId/screenshots/:viewport/:filename', asyncHandler(async (req: Request, res: Response) => {
  const { jobId, viewport, filename } = req.params;

  // Validate viewport
  if (viewport !== 'desktop' && viewport !== 'mobile') {
    res.status(400).json({ error: { code: 'INVALID_VIEWPORT', message: 'Invalid viewport' } });
    return;
  }

  // Validate filename (only allow alphanumeric, underscore, hyphen, dot)
  if (!/^[a-zA-Z0-9_\-]+\.png$/.test(filename)) {
    res.status(400).json({ error: { code: 'INVALID_FILENAME', message: 'Invalid filename' } });
    return;
  }

  const filePath = path.resolve(screenshotPath, jobId, viewport, filename);

  // Path traversal guard
  if (!filePath.startsWith(path.resolve(screenshotPath))) {
    res.status(403).json({ error: { code: 'PATH_TRAVERSAL', message: 'Invalid path' } });
    return;
  }

  try {
    await fsp.access(filePath);
    const stat = await fsp.stat(filePath);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);

    stream.on('error', (err) => {
      logger.error({ jobId, filename, error: err.message }, 'Screenshot stream error');
      if (!res.headersSent) {
        res.status(500).json({ error: { code: 'STREAM_ERROR', message: 'Failed to stream screenshot' } });
      }
    });
  } catch {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Screenshot not found' } });
  }
}));

// GET /api/jobs/:jobId/download
router.get('/:jobId/download', asyncHandler(async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = getJob(jobId);

  if (job.status !== 'completed') {
    res.status(404).json({
      error: { code: 'NOT_READY', message: 'Job is not yet completed' },
    });
    return;
  }

  // Find the ZIP file
  const jobDir = path.resolve(screenshotPath, jobId);
  if (!jobDir.startsWith(path.resolve(screenshotPath))) {
    res.status(403).json({
      error: { code: 'PATH_TRAVERSAL', message: 'Invalid path' },
    });
    return;
  }

  try {
    const files = await fsp.readdir(jobDir);
    const zipFile = files.find((f) => f.endsWith('.zip'));

    if (!zipFile) {
      res.status(410).json({
        error: { code: 'ZIP_EXPIRED', message: 'ZIP file not found or has been deleted' },
      });
      return;
    }

    const zipPath = path.join(jobDir, zipFile);
    const stat = await fsp.stat(zipPath);
    const domain = new URL(job.url).hostname;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Length', stat.size);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="screenshots-${domain}-${timestamp}.zip"`
    );

    const stream = fs.createReadStream(zipPath);
    stream.pipe(res);

    stream.on('error', (err) => {
      logger.error({ jobId, error: err.message }, 'ZIP stream error');
      if (!res.headersSent) {
        res.status(500).json({
          error: { code: 'STREAM_ERROR', message: 'Failed to stream ZIP file' },
        });
      }
    });
  } catch (error) {
    logger.error({ jobId, error: String(error) }, 'Download error');
    res.status(500).json({
      error: { code: 'DOWNLOAD_ERROR', message: 'Failed to prepare download' },
    });
  }
}));

export default router;
