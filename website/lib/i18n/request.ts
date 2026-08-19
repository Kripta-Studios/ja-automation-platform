import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  // Ensure the incoming locale is valid
  if (!locale || !routing.locales.includes(locale as 'en' | 'pt' | 'es')) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`@/content/locales/${locale}.json`)).default,
  };
});
