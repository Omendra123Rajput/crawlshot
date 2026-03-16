'use client';

export default function DashboardSkeleton() {
  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Back button skeleton */}
        <div className="skeleton-text w-24 h-4 mb-8" />

        <div className="space-y-6">
          {/* Status Card Skeleton */}
          <div className="glass p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="skeleton-text w-16" />
                <div className="skeleton-text-lg w-64" />
              </div>
              <div className="flex items-center gap-2">
                <div className="skeleton-circle w-2.5 h-2.5" />
                <div className="skeleton-text w-20" />
              </div>
            </div>
          </div>

          {/* Stats Row Skeleton */}
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass p-4 text-center space-y-2">
                <div className="skeleton-text-lg w-12 mx-auto" />
                <div className="skeleton-text w-20 mx-auto" />
              </div>
            ))}
          </div>

          {/* Progress Bar Skeleton */}
          <div className="glass p-4 space-y-3">
            <div className="flex justify-between">
              <div className="skeleton-text w-16" />
              <div className="skeleton-text w-8" />
            </div>
            <div className="h-3 rounded-full bg-white/5 overflow-hidden">
              <div className="skeleton h-full w-1/4 rounded-full" />
            </div>
          </div>

          {/* Log Feed Skeleton */}
          <div className="glass p-4 space-y-3">
            <div className="skeleton-text w-20 mb-3" />
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex gap-2" style={{ opacity: 1 - i * 0.15 }}>
                  <div className="skeleton-text w-20 shrink-0" />
                  <div className="skeleton-text flex-1" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
