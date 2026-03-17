'use client';

import { Download } from 'lucide-react';
import { getDownloadUrl } from '@/lib/api-client';

interface DownloadButtonProps {
  jobId: string;
  visible: boolean;
}

export default function DownloadButton({ jobId, visible }: DownloadButtonProps) {
  if (!visible) return null;

  const handleDownload = () => {
    window.open(getDownloadUrl(jobId), '_blank');
  };

  return (
    <button
      onClick={handleDownload}
      className="w-full py-4 px-6 bg-[var(--accent-primary)] rounded-xl text-zinc-950 font-semibold text-lg
                 flex items-center justify-center gap-3
                 btn-press focus-ring card-lift hover:brightness-110 transition-all duration-300"
    >
      <Download size={24} />
      Download ZIP
    </button>
  );
}
