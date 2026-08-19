import { Link } from '@/lib/i18n/navigation';
import { ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-ja-surface pt-20">
      <div className="container-ja text-center">
        <h1 className="text-9xl font-[family-name:var(--font-ibm-plex-mono)] font-bold text-ja-red mb-4">
          404
        </h1>
        <h2 className="heading-2 mb-6">Page Not Found</h2>
        <p className="text-body text-ja-steel-700 max-w-md mx-auto mb-10">
          The page you are looking for might have been removed, had its name changed, or is
          temporarily unavailable.
        </p>
        <Link href="/" className="btn btn-primary inline-flex items-center gap-2">
          <ArrowLeft size={16} /> Return to Home
        </Link>
      </div>
    </div>
  );
}
