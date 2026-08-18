import { base } from '$app/paths';
import { locales } from '@ja/i18n';
import { staticPaths } from '$lib/content';
export const prerender = true;
export const GET = () => {
  const origin = 'https://gex-dashboard.hopto.org';
  const urls = locales.flatMap((locale) =>
    ['', ...staticPaths].map((path) => `${origin}${base}/${locale}/${path ? `${path}/` : ''}`),
  );
  const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${url}</loc></url>`).join('')}</urlset>`;
  return new Response(body, { headers: { 'content-type': 'application/xml' } });
};
