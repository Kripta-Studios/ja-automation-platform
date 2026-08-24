'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Link } from '@/lib/i18n/navigation';
import { useTranslations } from 'next-intl';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('error');

  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-ja-surface pt-20">
      <div className="container-ja text-center max-w-lg">
        <div className="w-20 h-20 rounded-full bg-ja-red/10 text-ja-red flex items-center justify-center mx-auto mb-6">
          <AlertTriangle size={40} />
        </div>
        <h1 className="heading-2 mb-4">{t('h1')}</h1>
        <p className="text-body text-ja-steel-700 mb-10">{t('body')}</p>
        <div className="flex flex-col sm:flex-row justify-center gap-3">
          <button
            onClick={() => reset()}
            className="btn btn-primary inline-flex items-center justify-center gap-2"
          >
            <RotateCcw size={16} /> {t('tryAgain')}
          </button>
          <Link href="/" className="btn btn-secondary text-center">
            {t('returnHome')}
          </Link>
        </div>
      </div>
    </div>
  );
}
