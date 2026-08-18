import { isLocale, locales } from '@ja/i18n';
import { error } from '@sveltejs/kit';
import { staticPaths } from '$lib/content';
import type { EntryGenerator, PageLoad } from './$types';

export const entries: EntryGenerator = () =>
  locales.flatMap((locale) => staticPaths.map((path) => ({ locale, path })));
export const load: PageLoad = ({ params }) => {
  const path = params.path.replace(/\/$/, '');
  if (!isLocale(params.locale) || !staticPaths.includes(path)) error(404, 'Page not found');
  return { locale: params.locale, path };
};
