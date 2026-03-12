'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSSE } from '@/lib/sse-client';
import { getJob, type JobResponse } from '@/lib/api-client';
import JobProgress from '@/components/job-progress';
import ScreenshotGrid from '@/components/screenshot-grid';
import DownloadButton from '@/components/download-button';
import { ArrowLeft } from 'lucide-react';

function DashboardContent() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get('jobId');
  const [job, setJob] = useState<JobResponse | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const sse = useSSE(jobId);

  // Fetch initial job state
  useEffect(() => {
    if (!jobId) return;

    getJob(jobId)
      .then(setJob)
      .catch((err) => setFetchError(err.message));
  }, [jobId]);

  if (!jobId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass p-8 text-center space-y-4 max-w-md">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">No Job Selected</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Submit a URL on the home page to start a new scan.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 accent-gradient rounded-xl text-white text-sm font-medium"
          >
            <ArrowLeft size={16} />
            New Scan
          </Link>
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass p-8 text-center space-y-4 max-w-md">
          <h2 className="text-xl font-semibold text-[var(--error)]">Error</h2>
          <p className="text-sm text-[var(--text-secondary)]">{fetchError}</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 accent-gradient rounded-xl text-white text-sm font-medium"
          >
            <ArrowLeft size={16} />
            New Scan
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Back button */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors mb-8"
        >
          <ArrowLeft size={16} />
          New Scan
        </Link>

        <div className="space-y-6">
          <JobProgress
            status={sse.status}
            stats={sse.stats}
            events={sse.events}
            url={job?.url || ''}
            error={sse.error}
          />

          <ScreenshotGrid
            jobId={jobId}
            pagesScreenshotted={sse.stats.pagesScreenshotted}
          />

          <DownloadButton
            jobId={jobId}
            visible={sse.status === 'completed'}
          />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-[var(--text-muted)]">Loading...</div>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
