import Link from 'next/link';
import AnimatedShaderBackground from '@/components/animated-shader-background';
import ScanForm from '@/components/scan-form';
import { Search, Camera, Shield } from 'lucide-react';

export default function Home() {
  return (
    <>
      <AnimatedShaderBackground />

      <div className="relative z-10 min-h-screen">
        {/* Navbar */}
        <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-[var(--border-subtle)]" style={{ borderRadius: 0 }}>
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="text-[var(--accent-primary)]">
                <rect x="2" y="4" width="24" height="18" rx="3" stroke="currentColor" strokeWidth="2" />
                <circle cx="14" cy="13" r="4" stroke="currentColor" strokeWidth="2" />
                <path d="M2 8h24" stroke="currentColor" strokeWidth="2" />
              </svg>
              <span className="text-lg font-bold text-[var(--text-primary)]">CrawlShot</span>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="px-4 py-2 rounded-xl border border-[var(--border-subtle)] text-sm text-[var(--text-secondary)]
                           hover:border-[var(--border-active)] hover:text-[var(--accent-primary)] transition-all duration-300
                           btn-press focus-ring"
              >
                Dashboard
              </Link>
            </div>
          </div>
        </nav>

        {/* Hero Section — asymmetric split */}
        <main className="max-w-6xl mx-auto px-6 pt-[140px] pb-24">
          <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-16 items-start">
            {/* Left — text content */}
            <div className="space-y-8">
              <div
                className="inline-block glass px-4 py-2 rounded-full text-sm text-[var(--text-secondary)] animate-fade-up"
              >
                Powered by Playwright + BullMQ
              </div>

              <h1
                className="text-[clamp(2.5rem,6vw,4.5rem)] heading-display animate-fade-up"
                style={{ animationDelay: '100ms' }}
              >
                Capture Every Page.
                <br />
                <span className="accent-text">Automatically.</span>
              </h1>

              <p
                className="text-lg text-[var(--text-secondary)] body-prose animate-fade-up"
                style={{ animationDelay: '200ms' }}
              >
                Full-page screenshots of entire websites.
                Desktop &amp; mobile viewports. Blazing fast. Zero setup.
              </p>

              {/* Stats */}
              <div
                className="flex items-center gap-3 flex-wrap animate-fade-up"
                style={{ animationDelay: '300ms' }}
              >
                <span className="glass px-3 py-1.5 rounded-full text-xs text-[var(--text-tertiary)]">
                  10,000 pages
                </span>
                <span className="text-[var(--text-faint)]">&middot;</span>
                <span className="glass px-3 py-1.5 rounded-full text-xs text-[var(--text-tertiary)]">
                  2 viewports
                </span>
                <span className="text-[var(--text-faint)]">&middot;</span>
                <span className="glass px-3 py-1.5 rounded-full text-xs text-[var(--text-tertiary)]">
                  ZIP export
                </span>
              </div>
            </div>

            {/* Right — scan form */}
            <div className="animate-fade-up lg:mt-12" style={{ animationDelay: '300ms' }}>
              <ScanForm />
            </div>
          </div>
        </main>

        {/* Features — 2+1 asymmetric */}
        <section className="max-w-5xl mx-auto px-6 pb-24">
          <div className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <FeatureCard
                icon={<Search size={24} />}
                title="Deep Crawler"
                description="Discovers every internal link, respects robots.txt, and handles sitemaps automatically."
              />
              <FeatureCard
                icon={<Camera size={24} />}
                title="Pixel Perfect"
                description="Full-page, fully rendered captures with lazy-load scrolling and animation settling."
              />
            </div>
            <div className="md:max-w-[calc(50%-12px)]">
              <FeatureCard
                icon={<Shield size={24} />}
                title="SSRF Protected"
                description="Enterprise-grade security with DNS pre-checks and IP range blocking built in."
              />
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center py-8 text-sm text-[var(--text-muted)]">
          &copy; {new Date().getFullYear()} CrawlShot. All rights reserved.
        </footer>
      </div>
    </>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="glass glass-hover card-lift p-8 space-y-4">
      <div className="w-10 h-10 rounded-lg bg-[var(--accent-muted)] flex items-center justify-center text-[var(--accent-primary)]">
        {icon}
      </div>
      <h3 className="text-base font-semibold tracking-tight text-[var(--text-primary)]">{title}</h3>
      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{description}</p>
    </div>
  );
}
