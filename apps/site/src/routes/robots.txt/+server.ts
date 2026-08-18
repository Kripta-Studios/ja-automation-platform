import { base } from '$app/paths';
export const prerender = true;
export const GET = () =>
  new Response(
    `User-agent: *\nAllow: ${base}/\nDisallow: ${base}/app/\nSitemap: https://gex-dashboard.hopto.org${base}/sitemap.xml\n`,
    { headers: { 'content-type': 'text/plain' } },
  );
