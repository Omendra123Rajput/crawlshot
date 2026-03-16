'use client';

import { useState, useEffect, useRef } from 'react';
import { getSSEUrl } from './api-client';

export type JobStatus = 'queued' | 'crawling' | 'capturing' | 'packaging' | 'completed' | 'failed';

export interface SSEEvent {
  event: 'progress' | 'complete' | 'error';
  status?: JobStatus;
  pagesFound?: number;
  pagesScreenshotted?: number;
  totalExpected?: number;
  downloadUrl?: string;
  message?: string;
}

export interface SSEState {
  events: SSEEvent[];
  status: JobStatus;
  stats: {
    pagesFound: number;
    pagesScreenshotted: number;
    pagesFailed: number;
    totalExpected: number;
  };
  downloadUrl: string | null;
  error: string | null;
  connected: boolean;
}

const STATUS_ORDER: Record<string, number> = {
  queued: 0,
  crawling: 1,
  capturing: 2,
  packaging: 3,
  completed: 4,
  failed: 4,
};

export function useSSE(jobId: string | null): SSEState {
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [status, setStatus] = useState<JobStatus>('queued');
  const [stats, setStats] = useState({ pagesFound: 0, pagesScreenshotted: 0, pagesFailed: 0, totalExpected: 0 });
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const terminalRef = useRef(false);

  // --- SSE connection for real-time updates ---
  useEffect(() => {
    if (!jobId) return;

    const url = getSSEUrl(jobId);
    const es = new EventSource(url);

    es.onopen = () => {
      setConnected(true);
    };

    es.onmessage = (event) => {
      try {
        const data: SSEEvent = JSON.parse(event.data);
        setEvents((prev) => [...prev, data]);

        if (data.status) {
          setStatus(data.status);
        }

        if (data.pagesFound !== undefined) {
          setStats((prev) => ({ ...prev, pagesFound: data.pagesFound! }));
        }

        if (data.pagesScreenshotted !== undefined) {
          setStats((prev) => ({ ...prev, pagesScreenshotted: data.pagesScreenshotted! }));
        }

        if (data.totalExpected !== undefined) {
          setStats((prev) => ({ ...prev, totalExpected: data.totalExpected! }));
        }

        if (data.event === 'complete' && data.downloadUrl) {
          setDownloadUrl(data.downloadUrl);
          setStatus('completed');
          terminalRef.current = true;
          es.close();
          setConnected(false);
        }

        if (data.event === 'error') {
          setError(data.message || 'Unknown error');
          setStatus('failed');
          terminalRef.current = true;
          es.close();
          setConnected(false);
        }
      } catch {
        // Ignore parse errors (e.g., ping messages)
      }
    };

    es.onerror = () => {
      setConnected(false);
    };

    return () => {
      es.close();
      setConnected(false);
    };
  }, [jobId]);

  // --- REST polling fallback ---
  // Ensures progress updates even when SSE fails (404, proxy buffering, etc.)
  useEffect(() => {
    if (!jobId) return;
    let active = true;

    const poll = async () => {
      if (!active || terminalRef.current) return;

      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) return;
        const job = await res.json();

        // Monotonic status update: only advance, never regress
        setStatus((prev) => {
          const prevOrder = STATUS_ORDER[prev] ?? 0;
          const nextOrder = STATUS_ORDER[job.status] ?? 0;
          return nextOrder >= prevOrder ? job.status : prev;
        });

        // Monotonic stats update: take the max of each field
        setStats((prev) => ({
          pagesFound: Math.max(prev.pagesFound, job.stats?.pagesFound ?? 0),
          pagesScreenshotted: Math.max(prev.pagesScreenshotted, job.stats?.pagesScreenshotted ?? 0),
          pagesFailed: Math.max(prev.pagesFailed, job.stats?.pagesFailed ?? 0),
          totalExpected: prev.totalExpected || ((job.stats?.pagesFound ?? 0) * (job.viewports?.length ?? 2)),
        }));

        if (job.downloadUrl) setDownloadUrl(job.downloadUrl);
        if (job.error) setError(job.error);

        if (job.status === 'completed' || job.status === 'failed') {
          terminalRef.current = true;
        }
      } catch {
        // Silently ignore polling errors — SSE or next poll will catch up
      }
    };

    // Initial poll immediately to get current state
    poll();
    // Then poll every 2 seconds
    const interval = setInterval(poll, 2000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [jobId]);

  return { events, status, stats, downloadUrl, error, connected };
}
