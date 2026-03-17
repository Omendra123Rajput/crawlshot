import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { Analytics } from '@vercel/analytics/react';
import './globals.css';

export const metadata: Metadata = {
  title: 'CrawlShot — Full-Page Website Screenshots',
  description:
    'Capture full-page screenshots of entire websites. Desktop & mobile viewports. Blazing fast. Zero setup.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={GeistSans.variable}>
      <body className="min-h-screen antialiased font-sans">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
