'use client';

interface ScreenshotGridProps {
  jobId: string;
  pagesScreenshotted: number;
}

export default function ScreenshotGrid({ jobId, pagesScreenshotted }: ScreenshotGridProps) {
  if (pagesScreenshotted === 0) return null;

  return (
    <div className="glass p-6">
      <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">
        Screenshots ({pagesScreenshotted})
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: Math.min(pagesScreenshotted, 12) }).map((_, i) => (
          <div
            key={i}
            className="aspect-video rounded-xl bg-white/5 border border-[var(--border-subtle)]
                       flex items-center justify-center animate-fade-up"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <div className="text-center">
              <div className="w-8 h-8 rounded-lg bg-[var(--accent-primary)]/20 flex items-center justify-center mx-auto mb-2">
                <span className="text-xs text-[var(--accent-primary)] font-bold">{i + 1}</span>
              </div>
              <p className="text-xs text-[var(--text-muted)]">Page {i + 1}</p>
            </div>
          </div>
        ))}
      </div>
      {pagesScreenshotted > 12 && (
        <p className="text-sm text-[var(--text-muted)] text-center mt-4">
          +{pagesScreenshotted - 12} more screenshots in ZIP
        </p>
      )}
    </div>
  );
}
