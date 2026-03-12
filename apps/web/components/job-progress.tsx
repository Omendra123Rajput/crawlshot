'use client';

import { useEffect, useRef } from 'react';
import type { JobStatus, SSEEvent } from '@/lib/sse-client';

interface JobProgressProps {
  status: JobStatus;
  stats: {
    pagesFound: number;
    pagesScreenshotted: number;
    pagesFailed: number;
  };
  events: SSEEvent[];
  url: string;
  error: string | null;
}

const statusConfig: Record<JobStatus, { label: string; color: string; pulse: boolean }> = {
  queued: { label: 'Queued', color: 'bg-gray-500', pulse: false },
  crawling: { label: 'Crawling', color: 'bg-blue-500', pulse: true },
  capturing: { label: 'Capturing', color: 'bg-indigo-500', pulse: true },
  packaging: { label: 'Packaging', color: 'bg-amber-500', pulse: true },
  completed: { label: 'Completed', color: 'bg-emerald-500', pulse: false },
  failed: { label: 'Failed', color: 'bg-red-500', pulse: false },
};

export default function JobProgress({ status, stats, events, url, error }: JobProgressProps) {
  const logRef = useRef<HTMLDivElement>(null);
  const config = statusConfig[status];

  const progressPercent =
    stats.pagesFound > 0
      ? Math.round((stats.pagesScreenshotted / stats.pagesFound) * 100)
      : 0;

  // Auto-scroll log feed
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <div className="glass p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-[var(--text-secondary)]">Scanning</p>
            <p className="text-lg text-[var(--text-primary)] font-medium truncate max-w-md">
              {url}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${config.color} ${
                config.pulse ? 'animate-pulse' : ''
              }`}
            />
            <span className="text-sm font-medium text-[var(--text-primary)]">
              {config.label}
            </span>
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-[var(--error)]">{error}</p>
          </div>
        )}
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Pages Found" value={stats.pagesFound} />
        <StatCard label="Captured" value={stats.pagesScreenshotted} />
        <StatCard label="Failed" value={stats.pagesFailed} />
      </div>

      {/* Progress Bar */}
      {stats.pagesFound > 0 && (
        <div className="glass p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-[var(--text-secondary)]">Progress</span>
            <span className="text-[var(--text-primary)] font-medium">{progressPercent}%</span>
          </div>
          <div className="h-3 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full progress-bar-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Log Feed */}
      <div className="glass p-4">
        <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Event Log</h3>
        <div
          ref={logRef}
          className="max-h-[300px] overflow-y-auto space-y-1 text-xs font-mono"
        >
          {events.map((event, i) => (
            <div key={i} className="flex gap-2 text-[var(--text-muted)]">
              <span className="text-[var(--text-secondary)] shrink-0">
                {new Date().toLocaleTimeString()}
              </span>
              <span
                className={
                  event.event === 'error'
                    ? 'text-[var(--error)]'
                    : event.event === 'complete'
                    ? 'text-[var(--success)]'
                    : 'text-[var(--text-secondary)]'
                }
              >
                [{event.event}] {event.status && `status=${event.status}`}{' '}
                {event.pagesFound !== undefined && `found=${event.pagesFound}`}{' '}
                {event.pagesScreenshotted !== undefined &&
                  `captured=${event.pagesScreenshotted}`}
                {event.message && event.message}
                {event.downloadUrl && `download=${event.downloadUrl}`}
              </span>
            </div>
          ))}
          {events.length === 0 && (
            <p className="text-[var(--text-muted)]">Waiting for events...</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass p-4 text-center">
      <p className="text-2xl font-bold text-[var(--text-primary)]">{value.toLocaleString()}</p>
      <p className="text-xs text-[var(--text-secondary)] mt-1">{label}</p>
    </div>
  );
}
