import { type JobRecord, type JobStatus, JobNotFoundError } from '../types';

const jobs = new Map<string, JobRecord>();

export function createJob(jobId: string, url: string, viewports: string[]): JobRecord {
  const job: JobRecord = {
    jobId,
    url,
    viewports,
    status: 'queued',
    stats: {
      pagesFound: 0,
      pagesScreenshotted: 0,
      pagesFailed: 0,
      elapsedMs: 0,
    },
    error: null,
    downloadUrl: null,
    createdAt: new Date().toISOString(),
  };

  jobs.set(jobId, job);
  return job;
}

export function getJob(jobId: string): JobRecord {
  const job = jobs.get(jobId);
  if (!job) {
    throw new JobNotFoundError(jobId);
  }
  return job;
}

export function updateJob(jobId: string, update: Partial<JobRecord>): JobRecord {
  const job = getJob(jobId);
  Object.assign(job, update);
  return job;
}

export function updateJobStats(
  jobId: string,
  stats: Partial<JobRecord['stats']>
): JobRecord {
  const job = getJob(jobId);
  Object.assign(job.stats, stats);
  job.stats.elapsedMs = Date.now() - new Date(job.createdAt).getTime();
  return job;
}

export function setJobStatus(jobId: string, status: JobStatus): JobRecord {
  return updateJob(jobId, { status });
}

export function getAllJobs(): JobRecord[] {
  return Array.from(jobs.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function jobExists(jobId: string): boolean {
  return jobs.has(jobId);
}
