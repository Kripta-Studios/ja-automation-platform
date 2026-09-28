import type { Metadata } from 'next';
import { routing, type Locale } from '@/lib/i18n/routing';

const publicBasePath = (process.env.JA_PUBLIC_BASE_PATH ?? '/j-aautomation').replace(/\/+$/, '');

const localizedPath = (locale: Locale, pathname = '') => {
  const normalizedPath = pathname ? `/${pathname.replace(/^\/+/, '')}` : '';
  return `${publicBasePath}/${locale}${normalizedPath}`;
};

const resolveLocale = (locale: string): Locale =>
  routing.locales.includes(locale as Locale) ? (locale as Locale) : routing.defaultLocale;

export function localizedAlternates(
  locale: string,
  pathname = '',
): NonNullable<Metadata['alternates']> {
  const selectedLocale = resolveLocale(locale);
  return {
    canonical: localizedPath(selectedLocale, pathname),
    languages: {
      en: localizedPath('en', pathname),
      'pt-BR': localizedPath('pt', pathname),
      es: localizedPath('es', pathname),
      'x-default': localizedPath(routing.defaultLocale, pathname),
    },
  };
}

export function localizedRouteUrls(pathname = '') {
  return {
    en: localizedPath('en', pathname),
    'pt-BR': localizedPath('pt', pathname),
    es: localizedPath('es', pathname),
    'x-default': localizedPath(routing.defaultLocale, pathname),
  };
}
