import type { MetadataRoute } from 'next';
import { routing } from '@/lib/i18n/routing';
import { services } from '@/content/services';
import { industries } from '@/content/industries';
import { projects } from '@/content/projects';
import { localizedRouteUrls } from '@/lib/i18n/metadata';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.j-aautomation.com').replace(
    /\/+$/,
    '',
  );

  const staticRoutes = [
    '',
    '/about',
    '/careers',
    '/contact',
    '/projects',
    '/industries',
    '/capabilities',
    '/solutions/aquarex',
    '/privacy',
    '/terms',
  ];
  const dynamicRoutes = [
    ...services.map((service) => `/capabilities/${service.slug}`),
    ...industries.map((industry) => `/industries/${industry.slug}`),
    ...projects.map((project) => `/projects/${project.slug}`),
  ];
  const routes = [...new Set([...staticRoutes, ...dynamicRoutes])];

  const allRoutes = routes.flatMap((route) => {
    const localizedUrls = localizedRouteUrls(route);
    return routing.locales.map((locale) => ({
      url: `${baseUrl}${localizedUrls[locale === 'pt' ? 'pt-BR' : locale]}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: route === '' ? 1 : 0.8,
      alternates: { languages: localizedUrls },
    }));
  });

  return allRoutes;
}
