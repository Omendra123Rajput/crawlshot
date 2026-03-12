export type JobStatus = 'queued' | 'crawling' | 'capturing' | 'packaging' | 'completed' | 'failed';

export interface JobRecord {
  jobId: string;
  url: string;
  viewports: string[];
  status: JobStatus;
  stats: {
    pagesFound: number;
    pagesScreenshotted: number;
    pagesFailed: number;
    elapsedMs: number;
  };
  error: string | null;
  downloadUrl: string | null;
  createdAt: string;
}

export interface SSEEvent {
  event: 'progress' | 'complete' | 'error';
  status?: JobStatus;
  pagesFound?: number;
  pagesScreenshotted?: number;
  downloadUrl?: string;
  message?: string;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class SSRFBlockedError extends AppError {
  constructor(message: string) {
    super(message, 403, 'SSRF_BLOCKED');
    this.name = 'SSRFBlockedError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class JobNotFoundError extends AppError {
  constructor(jobId: string) {
    super(`Job not found: ${jobId}`, 404, 'JOB_NOT_FOUND');
    this.name = 'JobNotFoundError';
  }
}

export class ZipSizeLimitError extends AppError {
  constructor(message: string) {
    super(message, 413, 'ZIP_SIZE_LIMIT');
    this.name = 'ZipSizeLimitError';
  }
}

export class PageCaptureError extends AppError {
  constructor(message: string) {
    super(message, 500, 'PAGE_CAPTURE_ERROR');
    this.name = 'PageCaptureError';
  }
}
