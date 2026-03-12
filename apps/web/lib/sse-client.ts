'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getSSEUrl } from './api-client';

export type JobStatus = 'queued' | 'crawling' | 'capturing' | 'packaging' | 'completed' | 'failed';

export interface SSEEvent {
  event: 'progress' | 'complete' | 'error';
  status?: JobStatus;
  pagesFound?: number;
  pagesScreenshotted?: number;
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
  };
  downloadUrl: string | null;
  error: string | null;
  connected: boolean;
}

export function useSSE(jobId: string | null): SSEState {
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [status, setStatus] = useState<JobStatus>('queued');
  const [stats, setStats] = useState({ pagesFound: 0, pagesScreenshotted: 0, pagesFailed: 0 });
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const url = getSSEUrl(jobId);
    const es = new EventSource(url);
    eventSourceRef.current = es;

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

        if (data.event === 'complete' && data.downloadUrl) {
          setDownloadUrl(data.downloadUrl);
          setStatus('completed');
          es.close();
          setConnected(false);
        }

        if (data.event === 'error') {
          setError(data.message || 'Unknown error');
          setStatus('failed');
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

  return { events, status, stats, downloadUrl, error, connected };
}
