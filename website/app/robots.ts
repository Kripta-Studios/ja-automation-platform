import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.j-aautomation.com';
  const basePath = (process.env.JA_PUBLIC_BASE_PATH ?? '/j-aautomation').replace(/\/+$/, '');

  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${baseUrl}${basePath}/sitemap.xml`,
  };
}
