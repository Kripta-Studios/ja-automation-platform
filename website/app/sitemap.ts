import type { MetadataRoute } from 'next';
import { routing } from '@/lib/i18n/routing';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://www.j-aautomation.com';

  const staticRoutes = [
    '',
    '/about',
    '/careers',
    '/contact',
    '/projects',
    '/industries',
    '/capabilities',
    '/solutions/aquarex',
  ];

  // We could dynamically generate capabilities, industries, and projects here,
  // but for simplicity in this example we just include the static routes.
  const allRoutes = staticRoutes.flatMap((route) => {
    return routing.locales.map((locale) => ({
      url: `${baseUrl}/${locale}${route}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: route === '' ? 1 : 0.8,
    }));
  });

  return allRoutes;
}
