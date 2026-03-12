'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createJob } from '@/lib/api-client';
import { Monitor, Smartphone, ArrowRight, Loader2 } from 'lucide-react';

export default function ScanForm() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [viewports, setViewports] = useState<Set<'desktop' | 'mobile'>>(
    new Set(['desktop', 'mobile'])
  );
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
      });

      router.push(`/dashboard?jobId=${result.jobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start scan');
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="glass p-8 max-w-[600px] w-full mx-auto space-y-6">
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

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => toggleViewport('desktop')}
          disabled={loading}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all duration-300 text-sm
            ${
              viewports.has('desktop')
                ? 'border-[var(--border-active)] bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]'
                : 'border-[var(--border-subtle)] bg-white/3 text-[var(--text-muted)] hover:border-[var(--border-active)]'
            } disabled:opacity-50`}
        >
          <Monitor size={16} />
          Desktop
        </button>
        <button
          type="button"
          onClick={() => toggleViewport('mobile')}
          disabled={loading}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all duration-300 text-sm
            ${
              viewports.has('mobile')
                ? 'border-[var(--border-active)] bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]'
                : 'border-[var(--border-subtle)] bg-white/3 text-[var(--text-muted)] hover:border-[var(--border-active)]'
            } disabled:opacity-50`}
        >
          <Smartphone size={16} />
          Mobile
        </button>
      </div>

      <button
        type="submit"
        disabled={loading || !url}
        className="w-full py-3 px-6 accent-gradient rounded-xl text-white font-semibold
                   flex items-center justify-center gap-2
                   hover:animate-pulse-glow transition-all duration-300
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
