'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSSE } from '@/lib/sse-client';
import { getJob, type JobResponse } from '@/lib/api-client';
import JobProgress from '@/components/job-progress';
import ScreenshotGrid from '@/components/screenshot-grid';
import DownloadButton from '@/components/download-button';
import DashboardSkeleton from '@/components/dashboard-skeleton';
import { ArrowLeft, Search, AlertCircle } from 'lucide-react';

function DashboardContent() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get('jobId');
  const [job, setJob] = useState<JobResponse | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const sse = useSSE(jobId);

  // Fetch initial job state
  useEffect(() => {
    if (!jobId) {
      setLoading(false);
      return;
    }

    getJob(jobId)
      .then((data) => {
        setJob(data);
        setLoading(false);
      })
      .catch((err) => {
        setFetchError(err.message);
        setLoading(false);
      });
  }, [jobId]);

  if (!jobId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass p-10 text-center space-y-5 max-w-md animate-fade-up">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-muted)] flex items-center justify-center mx-auto">
            <Search size={24} className="text-[var(--accent-primary)]" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">No Job Selected</h2>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            Submit a URL on the home page to start a new scan.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--accent-primary)] rounded-xl text-zinc-950 text-sm font-medium
                       btn-press focus-ring hover:brightness-110 transition-all duration-300"
          >
            <ArrowLeft size={16} />
            New Scan
          </Link>
        </div>
      </div>
    );
  }

  // Show skeleton while loading initial job data
  if (loading) {
    return <DashboardSkeleton />;
  }

  if (fetchError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass p-10 text-center space-y-5 max-w-md animate-fade-up">
          <div className="w-12 h-12 rounded-xl bg-[var(--error)]/10 flex items-center justify-center mx-auto">
            <AlertCircle size={24} className="text-[var(--error)]" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-[var(--error)]">Error</h2>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{fetchError}</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--accent-primary)] rounded-xl text-zinc-950 text-sm font-medium
                       btn-press focus-ring hover:brightness-110 transition-all duration-300"
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
          className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] link-hover hover:text-[var(--accent-primary)] transition-colors mb-8"
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
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}
