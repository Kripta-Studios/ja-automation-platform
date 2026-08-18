import { isLocale, locales } from '@ja/i18n';
import { error } from '@sveltejs/kit';
import type { EntryGenerator, PageLoad } from './$types';

export const entries: EntryGenerator = () => locales.map((locale) => ({ locale }));
export const load: PageLoad = ({ params }) => {
  if (!isLocale(params.locale)) error(404, 'Locale not found');
  return { locale: params.locale, path: '' };
};
