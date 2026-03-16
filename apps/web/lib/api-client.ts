// In production, use relative URLs so requests go through Next.js rewrites (avoids CORS).
// In development, call the API directly.
const API_URL = typeof window !== 'undefined'
  ? ''  // Browser: use relative URLs → Next.js rewrites proxy to the API
  : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001');

export interface CreateJobRequest {
  url: string;
  viewports: ('desktop' | 'mobile')[];
  maxDepth: number;
}

export interface CreateJobResponse {
  jobId: string;
  status: string;
  createdAt: string;
}

export interface JobResponse {
  jobId: string;
  url: string;
  status: 'queued' | 'crawling' | 'capturing' | 'packaging' | 'completed' | 'failed';
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

export async function createJob(data: CreateJobRequest): Promise<CreateJobResponse> {
  const res = await fetch(`${API_URL}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error?.message || 'Failed to create job');
  }

  return res.json();
}

export async function getJob(jobId: string): Promise<JobResponse> {
  const res = await fetch(`${API_URL}/api/jobs/${jobId}`);

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error?.message || 'Failed to fetch job');
  }

  return res.json();
}

export function getSSEUrl(jobId: string): string {
  return `${API_URL}/api/jobs/${jobId}/stream`;
}

export function getDownloadUrl(jobId: string): string {
  return `${API_URL}/api/jobs/${jobId}/download`;
}

export interface ScreenshotInfo {
  viewport: string;
  filename: string;
  url: string;
}

export async function getScreenshots(jobId: string): Promise<ScreenshotInfo[]> {
  const res = await fetch(`${API_URL}/api/jobs/${jobId}/screenshots`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.screenshots || [];
}

export function getScreenshotUrl(jobId: string, viewport: string, filename: string): string {
  return `${API_URL}/api/jobs/${jobId}/screenshots/${viewport}/${filename}`;
}
