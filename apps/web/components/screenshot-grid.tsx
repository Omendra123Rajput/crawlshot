'use client';

import { useState, useEffect, useCallback } from 'react';
import { getScreenshots, type ScreenshotInfo } from '@/lib/api-client';
import { ImageIcon } from 'lucide-react';

interface ScreenshotGridProps {
  jobId: string;
  pagesScreenshotted: number;
}

export default function ScreenshotGrid({ jobId, pagesScreenshotted }: ScreenshotGridProps) {
  const [screenshots, setScreenshots] = useState<ScreenshotInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchScreenshots = useCallback(async () => {
    if (!jobId || pagesScreenshotted === 0) return;
    setLoading(true);
    try {
      const data = await getScreenshots(jobId);
      setScreenshots(data);
    } catch {
      // Silently fail — previews are non-critical
    } finally {
      setLoading(false);
    }
  }, [jobId, pagesScreenshotted]);

  // Fetch screenshots periodically as they come in
  useEffect(() => {
    if (pagesScreenshotted === 0) return;

    fetchScreenshots();

    // Poll every 5 seconds while screenshots are being taken
    const interval = setInterval(fetchScreenshots, 5000);
    return () => clearInterval(interval);
  }, [fetchScreenshots, pagesScreenshotted]);

  if (pagesScreenshotted === 0 && screenshots.length === 0) return null;

  // Group by viewport, show desktop first
  const desktopShots = screenshots.filter((s) => s.viewport === 'desktop');
  const mobileShots = screenshots.filter((s) => s.viewport === 'mobile');
  const displayShots = [...desktopShots, ...mobileShots].slice(0, 12);
  const remaining = screenshots.length - 12;

  return (
    <div className="glass p-6">
      <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">
        Screenshots ({screenshots.length || pagesScreenshotted})
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {displayShots.length > 0
          ? displayShots.map((shot, i) => (
              <ScreenshotThumbnail key={`${shot.viewport}-${shot.filename}`} shot={shot} index={i} />
            ))
          : /* Show skeleton placeholders while loading */
            Array.from({ length: Math.min(pagesScreenshotted, 12) }).map((_, i) => (
              <ScreenshotSkeleton key={i} index={i} />
            ))}
      </div>
      {(remaining > 0 || pagesScreenshotted > 12) && (
        <p className="text-sm text-[var(--text-muted)] text-center mt-4">
          +{remaining > 0 ? remaining : pagesScreenshotted - 12} more screenshots in ZIP
        </p>
      )}
    </div>
  );
}

function ScreenshotThumbnail({ shot, index }: { shot: ScreenshotInfo; index: number }) {
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  return (
    <div
      className="relative aspect-video rounded-xl overflow-hidden bg-white/5 border border-[var(--border-subtle)]
                 group cursor-pointer animate-fade-up hover:border-[var(--border-active)] transition-all duration-300"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {!error ? (
        <>
          {!loaded && <ScreenshotSkeleton index={0} inline />}
          <img
            src={shot.url}
            alt={`${shot.viewport} — ${shot.filename.replace('.png', '')}`}
            className={`w-full h-full object-cover object-top transition-opacity duration-300 ${
              loaded ? 'opacity-100' : 'opacity-0'
            }`}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onError={() => setError(true)}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent
                          opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="absolute bottom-0 left-0 right-0 p-2 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-white/20 text-white backdrop-blur-sm">
              {shot.viewport}
            </span>
            <p className="text-[10px] text-white/80 truncate mt-0.5">
              {shot.filename.replace('.png', '').replace(/_/g, '/')}
            </p>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-1">
          <ImageIcon size={20} className="text-[var(--text-muted)]" />
          <p className="text-[10px] text-[var(--text-muted)]">Preview unavailable</p>
        </div>
      )}
    </div>
  );
}

function ScreenshotSkeleton({ index, inline }: { index: number; inline?: boolean }) {
  return (
    <div
      className={`${
        inline ? 'absolute inset-0' : 'aspect-video rounded-xl border border-[var(--border-subtle)]'
      } bg-white/5 overflow-hidden`}
      style={!inline ? { animationDelay: `${index * 100}ms` } : undefined}
    >
      <div className="h-full w-full animate-pulse flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-primary)]/10 flex items-center justify-center mx-auto mb-2">
            <div className="w-4 h-4 rounded bg-[var(--accent-primary)]/20" />
          </div>
          <div className="w-16 h-2 rounded bg-white/10 mx-auto" />
        </div>
      </div>
    </div>
  );
}
