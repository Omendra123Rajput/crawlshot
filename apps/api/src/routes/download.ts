import { Router, type Request, type Response } from 'express';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { getJob } from '../services/job-store';
import { logger } from '@screenshot-crawler/utils';

const router = Router();

const screenshotPath = process.env.SCREENSHOT_PATH || '/tmp/screenshots';

// GET /api/jobs/:jobId/download
router.get('/:jobId/download', async (req: Request, res: Response) => {
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
});

export default router;
