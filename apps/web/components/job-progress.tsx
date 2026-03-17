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
  queued: { label: 'Queued', color: 'bg-[var(--text-muted)]', pulse: false },
  crawling: { label: 'Crawling', color: 'bg-[var(--accent-primary)]', pulse: true },
  capturing: { label: 'Capturing', color: 'bg-[var(--accent-primary)]', pulse: true },
  packaging: { label: 'Packaging', color: 'bg-[var(--warning)]', pulse: true },
  completed: { label: 'Completed', color: 'bg-[var(--success)]', pulse: false },
  failed: { label: 'Failed', color: 'bg-[var(--error)]', pulse: false },
};

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function JobProgress({ status, stats, events, url, error }: JobProgressProps) {
  const logRef = useRef<HTMLDivElement>(null);
  const config = statusConfig[status];

  // Elapsed timer — ticks every second while job is active
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());
  const isActive = status !== 'completed' && status !== 'failed';

  useEffect(() => {
    if (!isActive) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isActive]);

  // Use totalExpected (pagesFound x viewports) as denominator to avoid >100%
  const denominator = stats.totalExpected > 0 ? stats.totalExpected : stats.pagesFound;
  const rawPercent =
    denominator > 0
      ? Math.round((stats.pagesScreenshotted / denominator) * 100)
      : 0;
  const percent = status === 'completed' ? 100 : Math.min(rawPercent, 100);

  const isIndeterminate =
    status === 'queued' ||
    status === 'crawling' ||
    (status === 'capturing' && stats.totalExpected === 0);

  // Auto-scroll activity feed
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
            <p className="label-caps text-[var(--text-tertiary)]">Scanning</p>
            <p className="text-lg text-[var(--text-primary)] font-medium tracking-tight truncate max-w-md mt-1">
              {url}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isActive && (
              <span className="text-xs text-[var(--text-muted)] tabular-nums">
                {formatElapsed(elapsed)}
              </span>
            )}
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
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl bg-[var(--error)]/10 border border-[var(--error)]/20">
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
      <div className="glass p-5 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-[var(--text-secondary)]">Progress</span>
          <span className="text-[var(--text-primary)] font-medium tabular-nums">
            {isIndeterminate
              ? (status === 'capturing' ? 'Preparing captures...' : 'Discovering pages...')
              : `${percent}%`}
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-white/5 overflow-hidden">
          {isIndeterminate ? (
            <div className="h-full w-full relative">
              <div
                className="absolute h-full rounded-full progress-bar-fill"
                style={{
                  width: '30%',
                  animation: 'indeterminate 1.8s ease-in-out infinite',
                }}
              />
            </div>
          ) : (
            <div
              className="h-full rounded-full progress-bar-fill relative"
              style={{ width: `${percent}%` }}
            >
              {status !== 'completed' && status !== 'failed' && percent > 0 && (
                <div className="absolute inset-0 overflow-hidden rounded-full">
                  <div
                    className="absolute inset-0"
                    style={{
                      background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)',
                      animation: 'shimmer 1.8s ease-in-out infinite',
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
        {status === 'packaging' && (
          <p className="text-xs text-[var(--text-tertiary)]">Packaging screenshots into ZIP...</p>
        )}
        {status === 'capturing' && stats.totalExpected > 0 && (
          <p className="text-xs text-[var(--text-tertiary)]">
            Capturing screenshot {stats.pagesScreenshotted} of {stats.totalExpected}...
          </p>
        )}
        {status === 'crawling' && stats.pagesFound > 0 && (
          <p className="text-xs text-[var(--text-tertiary)]">
            Found {stats.pagesFound.toLocaleString()} pages so far...
          </p>
        )}
      </div>

      {/* Activity Feed */}
      <div className="glass p-5">
        <h3 className="label-caps text-[var(--text-muted)] mb-4">Activity</h3>
        <div
          ref={logRef}
          className="max-h-[280px] overflow-y-auto space-y-0"
        >
          {events.map((event, i) => (
            <div key={i} className="flex gap-3 py-2 border-b border-[var(--border-subtle)] last:border-0 text-xs">
              <span className="text-[var(--text-muted)] shrink-0 tabular-nums">
                {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
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
                {event.status && `${event.status}`}{' '}
                {event.pagesFound !== undefined && `${event.pagesFound} pages found`}{' '}
                {event.pagesScreenshotted !== undefined && `${event.pagesScreenshotted} captured`}
                {event.message && event.message}
              </span>
            </div>
          ))}
          {events.length === 0 && (
            <p className="text-[var(--text-muted)] py-2">Waiting for events...</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass card-lift p-5 text-center">
      <p className="text-2xl font-bold tracking-tight text-[var(--text-primary)] tabular-nums">
        {value.toLocaleString()}
      </p>
      <p className="label-caps text-[var(--text-tertiary)] mt-1.5">{label}</p>
    </div>
  );
}
