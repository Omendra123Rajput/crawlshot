'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createJob } from '@/lib/api-client';
import { Monitor, Smartphone, ArrowRight, Loader2, Layers } from 'lucide-react';

type CrawlDepthOption = {
  value: number;
  label: string;
  description: string;
};

const CRAWL_DEPTH_OPTIONS: CrawlDepthOption[] = [
  { value: 0, label: 'Homepage Only', description: 'Just the landing page' },
  { value: 1, label: 'Main Pages', description: 'Pages linked from homepage' },
  { value: 2, label: 'Standard', description: '2 levels deep' },
  { value: 3, label: 'Deep', description: '3 levels deep' },
  { value: -1, label: 'Full Site', description: 'Crawl everything (up to 10k)' },
];

export default function ScanForm() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [viewports, setViewports] = useState<Set<'desktop' | 'mobile'>>(
    new Set(['desktop', 'mobile'])
  );
  const [maxDepth, setMaxDepth] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const toggleViewport = (vp: 'desktop' | 'mobile') => {
    const next = new Set(viewports);
    if (next.has(vp)) {
      if (next.size > 1) next.delete(vp);
    } else {
      next.add(vp);
    }
    setViewports(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!url.startsWith('https://')) {
      setError('URL must start with https://');
      return;
    }

    try {
      new URL(url);
    } catch {
      setError('Please enter a valid URL');
      return;
    }

    setLoading(true);

    try {
      const result = await createJob({
        url,
        viewports: Array.from(viewports),
        maxDepth,
      });

      router.push(`/dashboard?jobId=${result.jobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start scan');
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="glass p-8 lg:p-10 w-full mx-auto space-y-6">
      <div className="space-y-2">
        <input
          type="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError(null);
          }}
          placeholder="https://your-website.com"
          disabled={loading}
          className="w-full px-4 py-3 bg-white/5 border border-[var(--border-subtle)] rounded-xl
                     text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
                     focus:outline-none focus:border-[var(--border-active)] focus:ring-1 focus:ring-[var(--accent-glow)]
                     transition-all duration-300 disabled:opacity-50"
        />
        {error && (
          <p className="text-sm text-[var(--error)] px-1">{error}</p>
        )}
      </div>

      {/* Crawl Depth Selector */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Layers size={14} />
          <span>Crawl Depth</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {CRAWL_DEPTH_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setMaxDepth(option.value)}
              disabled={loading}
              className={`px-3 py-1.5 rounded-lg border transition-all duration-300 text-xs btn-press focus-ring
                ${
                  maxDepth === option.value
                    ? 'border-[var(--border-active)] bg-[var(--accent-muted)] text-[var(--accent-primary)]'
                    : 'border-[var(--border-subtle)] bg-white/3 text-[var(--text-muted)] hover:border-[var(--border-active)] hover:text-[var(--text-secondary)]'
                } disabled:opacity-50`}
              title={option.description}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-[var(--text-muted)] px-1">
          {CRAWL_DEPTH_OPTIONS.find((o) => o.value === maxDepth)?.description}
        </p>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => toggleViewport('desktop')}
          disabled={loading}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all duration-300 text-sm btn-press focus-ring
            ${
              viewports.has('desktop')
                ? 'border-[var(--border-active)] bg-[var(--accent-muted)] text-[var(--accent-primary)]'
                : 'border-[var(--border-subtle)] bg-white/3 text-[var(--text-muted)] hover:border-[var(--border-active)] hover:text-[var(--text-secondary)]'
            } disabled:opacity-50`}
        >
          <Monitor size={16} />
          Desktop
        </button>
        <button
          type="button"
          onClick={() => toggleViewport('mobile')}
          disabled={loading}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all duration-300 text-sm btn-press focus-ring
            ${
              viewports.has('mobile')
                ? 'border-[var(--border-active)] bg-[var(--accent-muted)] text-[var(--accent-primary)]'
                : 'border-[var(--border-subtle)] bg-white/3 text-[var(--text-muted)] hover:border-[var(--border-active)] hover:text-[var(--text-secondary)]'
            } disabled:opacity-50`}
        >
          <Smartphone size={16} />
          Mobile
        </button>
      </div>

      <button
        type="submit"
        disabled={loading || !url}
        className="w-full py-3 px-6 bg-[var(--accent-primary)] rounded-xl text-zinc-950 font-semibold
                   flex items-center justify-center gap-2
                   btn-press focus-ring hover:brightness-110 transition-all duration-300
                   disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <Loader2 size={20} className="animate-spin" />
            Starting Scan...
          </>
        ) : (
          <>
            Start Scan
            <ArrowRight size={20} />
          </>
        )}
      </button>
    </form>
  );
}
