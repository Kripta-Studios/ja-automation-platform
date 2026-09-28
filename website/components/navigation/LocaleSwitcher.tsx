'use client';

import { Suspense } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useRouter, usePathname } from '@/lib/i18n/navigation';
import { routing } from '@/lib/i18n/routing';

interface LocaleSwitcherProps {
  variant?: 'light' | 'dark';
}

function LocaleSwitcherContent({ variant = 'dark' }: LocaleSwitcherProps) {
  const locale = useLocale();
  const t = useTranslations('nav');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleChange = (newLocale: (typeof routing.locales)[number]) => {
    const query = searchParams.toString();
    const hash = window.location.hash;
    const suffix = `${query ? `?${query}` : ''}${hash}`;
    router.replace(`${pathname}${suffix}`, { locale: newLocale });
  };

  const baseStyles =
    variant === 'light' ? 'text-white/70 hover:text-white' : 'text-ja-steel-500 hover:text-ja-ink';

  const activeStyles =
    variant === 'light' ? 'text-white font-semibold' : 'text-ja-ink font-semibold';

  return (
    <nav className="flex items-center gap-1" aria-label={t('languageSelector')}>
      {routing.locales.map((loc, idx) => (
        <span key={loc} className="flex items-center">
          {idx > 0 && (
            <span
              className={`mx-1 text-xs ${variant === 'light' ? 'text-white/30' : 'text-ja-steel-300'}`}
            >
              /
            </span>
          )}
          <button
            type="button"
            onClick={() => handleChange(loc)}
            className={`text-xs font-medium uppercase px-1 py-0.5 rounded transition-colors duration-200
              ${locale === loc ? activeStyles : baseStyles}
            `}
            aria-label={t('switchTo', { language: t(`languageNames.${loc}`) })}
            aria-current={locale === loc ? 'true' : undefined}
            aria-pressed={locale === loc}
          >
            {t(`languageLabels.${loc}`)}
          </button>
        </span>
      ))}
    </nav>
  );
}

export function LocaleSwitcher(props: LocaleSwitcherProps) {
  return (
    <Suspense fallback={null}>
      <LocaleSwitcherContent {...props} />
    </Suspense>
  );
}
