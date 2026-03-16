'use client';

import { useEffect, useRef, useState } from 'react';
import type { JobStatus, SSEEvent } from '@/lib/sse-client';

interface JobProgressProps {
  status: JobStatus;
  stats: {
    pagesFound: number;
    pagesScreenshotted: number;
    pagesFailed: number;
    totalExpected: number;
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

/**
 * Eased progress: starts fast, slows down as it approaches completion.
 * Creates the perception of immediate feedback while being honest about actual progress.
 */
function easeProgress(realPercent: number): number {
  if (realPercent <= 0) return 0;
  if (realPercent >= 100) return 100;
  // Ease-out cubic: fast start, slow finish
  const t = realPercent / 100;
  const eased = 1 - Math.pow(1 - t, 3);
  return Math.round(eased * 100);
}

export default function JobProgress({ status, stats, events, url, error }: JobProgressProps) {
  const logRef = useRef<HTMLDivElement>(null);
  const config = statusConfig[status];

  // Use totalExpected (pagesFound × viewports) as denominator to avoid >100%
  const denominator = stats.totalExpected > 0 ? stats.totalExpected : stats.pagesFound;
  const rawPercent =
    denominator > 0
      ? Math.round((stats.pagesScreenshotted / denominator) * 100)
      : 0;
  const realPercent = Math.min(rawPercent, 100);

  // Apply illusion: eased progress that starts fast
  const displayPercent = status === 'completed' ? 100 : easeProgress(realPercent);

  // Optimistic initial progress — show a small amount of progress immediately
  const [optimisticBump, setOptimisticBump] = useState(0);
  useEffect(() => {
    if (status === 'queued' || status === 'crawling') {
      // Show a quick 2-8% bump within first few seconds to feel responsive
      const t1 = setTimeout(() => setOptimisticBump(2), 300);
      const t2 = setTimeout(() => setOptimisticBump(5), 1000);
      const t3 = setTimeout(() => setOptimisticBump(8), 2500);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }
    setOptimisticBump(0);
  }, [status]);

  const shownPercent = status === 'completed'
    ? 100
    : Math.max(displayPercent, optimisticBump);

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
      <div className="glass p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-[var(--text-secondary)]">Progress</span>
          <span className="text-[var(--text-primary)] font-medium">
            {status === 'completed' ? '100' : realPercent}%
          </span>
        </div>
        <div className="h-3 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full rounded-full progress-bar-fill relative"
            style={{ width: `${shownPercent}%` }}
          >
            {/* Shimmer overlay on active progress */}
            {status !== 'completed' && status !== 'failed' && shownPercent > 0 && (
              <div className="absolute inset-0 overflow-hidden rounded-full">
                <div
                  className="absolute inset-0 animate-shimmer"
                  style={{
                    background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)',
                    animation: 'shimmer 1.8s ease-in-out infinite',
                  }}
                />
              </div>
            )}
          </div>
        </div>
        {/* Status hint text */}
        {status === 'packaging' && (
          <p className="text-xs text-[var(--text-muted)]">Packaging screenshots into ZIP...</p>
        )}
      </div>

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
