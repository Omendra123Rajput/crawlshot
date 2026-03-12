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
                           hover:border-[var(--border-active)] hover:text-[var(--accent-primary)] transition-all duration-300"
              >
                Dashboard
              </Link>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <main className="max-w-4xl mx-auto px-6 pt-[180px] pb-24 text-center">
          <div
            className="inline-block glass px-4 py-2 rounded-full text-sm text-[var(--text-secondary)] mb-8 animate-fade-up"
          >
            Powered by Playwright + BullMQ
          </div>

          <h1
            className="text-[clamp(3rem,8vw,6rem)] font-extrabold leading-[1.1] mb-6 animate-fade-up"
            style={{ animationDelay: '100ms' }}
          >
            Capture Every Page.
            <br />
            <span className="gradient-text">Automatically.</span>
          </h1>

          <p
            className="text-lg text-[var(--text-secondary)] max-w-2xl mx-auto mb-12 animate-fade-up"
            style={{ animationDelay: '200ms' }}
          >
            Full-page screenshots of entire websites.
            <br />
            Desktop &amp; mobile. Blazing fast. Zero setup.
          </p>

          <div className="animate-fade-up" style={{ animationDelay: '300ms' }}>
            <ScanForm />
          </div>

          {/* Stats Row */}
          <div
            className="flex items-center justify-center gap-4 mt-12 animate-fade-up"
            style={{ animationDelay: '400ms' }}
          >
            <span className="glass px-4 py-2 rounded-full text-sm text-[var(--text-secondary)]">
              10,000 pages
            </span>
            <span className="text-[var(--text-muted)]">&middot;</span>
            <span className="glass px-4 py-2 rounded-full text-sm text-[var(--text-secondary)]">
              2 viewports
            </span>
            <span className="text-[var(--text-muted)]">&middot;</span>
            <span className="glass px-4 py-2 rounded-full text-sm text-[var(--text-secondary)]">
              ZIP export
            </span>
          </div>
        </main>

        {/* Features Section */}
        <section className="max-w-5xl mx-auto px-6 pb-24">
          <div className="grid md:grid-cols-3 gap-6">
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
            <FeatureCard
              icon={<Shield size={24} />}
              title="SSRF Protected"
              description="Enterprise-grade security with DNS pre-checks and IP range blocking built in."
            />
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center py-8 text-sm text-[var(--text-muted)]">
          Built with Next.js, Express, Playwright &amp; BullMQ
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
    <div className="glass glass-hover p-6 space-y-4">
      <div className="w-12 h-12 rounded-xl bg-[var(--accent-primary)]/10 flex items-center justify-center text-[var(--accent-primary)]">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h3>
      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{description}</p>
    </div>
  );
}
