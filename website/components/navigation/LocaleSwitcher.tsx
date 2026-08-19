'use client';

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from '@/lib/i18n/navigation';
import { routing } from '@/lib/i18n/routing';

interface LocaleSwitcherProps {
  variant?: 'light' | 'dark';
}

export function LocaleSwitcher({ variant = 'dark' }: LocaleSwitcherProps) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const handleChange = (newLocale: string) => {
    router.replace(pathname, { locale: newLocale });
  };

  const baseStyles =
    variant === 'light' ? 'text-white/70 hover:text-white' : 'text-ja-steel-500 hover:text-ja-ink';

  const activeStyles =
    variant === 'light' ? 'text-white font-semibold' : 'text-ja-ink font-semibold';

  return (
    <div className="flex items-center gap-1" role="navigation" aria-label="Language selector">
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
            onClick={() => handleChange(loc)}
            className={`text-xs font-medium uppercase px-1 py-0.5 rounded transition-colors duration-200
              ${locale === loc ? activeStyles : baseStyles}
            `}
            aria-label={`Switch to ${loc === 'en' ? 'English' : loc === 'pt' ? 'Português' : 'Español'}`}
            aria-current={locale === loc ? 'true' : undefined}
          >
            {loc.toUpperCase()}
          </button>
        </span>
      ))}
    </div>
  );
}
