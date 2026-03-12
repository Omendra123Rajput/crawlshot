import type { Metadata } from 'next';
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
    <html lang="en">
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
