import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n/navigation';
import { projects } from '@/content/projects';
import type { Capability, Industry } from '@/content/types';
import { projectCapabilityKeys, projectIndustryKeys, translateProject } from '@/lib/i18n/content';
import { localizedAlternates } from '@/lib/i18n/metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  return {
    title: t('projectsTitle'),
    description: t('projectsDescription'),
    alternates: localizedAlternates(locale, '/projects'),
  };
}

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? '') : (value ?? '');

const yearMatches = (projectYear: number | undefined, filter: string): boolean => {
  if (!filter) return true;
  if (!projectYear) return false;
  if (filter === '2020_2026') return projectYear >= 2020 && projectYear <= 2026;
  if (filter === '2015_2019') return projectYear >= 2015 && projectYear <= 2019;
  if (filter === '2010_2014') return projectYear >= 2010 && projectYear <= 2014;
  if (filter === 'before_2010') return projectYear < 2010;
  return projectYear === Number(filter);
};

export default async function ProjectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = (await searchParams) ?? {};
  const filters = {
    industry: first(query.industry),
    client: first(query.client),
    technology: first(query.technology),
    capability: first(query.capability),
    region: first(query.region),
    year: first(query.year),
  };

  const t = await getTranslations('projectExperience');
  const nav = await getTranslations('nav');
  const filterText = await getTranslations('projectFilters');
  const projectCatalog = await getTranslations('projectCatalog');
  const filteredProjects = projects.filter((project) => {
    const region = (project.location ?? '').toLowerCase();
    return (
      (!filters.industry || project.industry === filters.industry) &&
      (!filters.client || project.client === filters.client) &&
      (!filters.technology || project.technologies.includes(filters.technology)) &&
      (!filters.capability || project.capabilities.includes(filters.capability as Capability)) &&
      (!filters.region || region.includes(filters.region.toLowerCase())) &&
      yearMatches(project.startYear, filters.year)
    );
  });
  const localizedFilteredProjects = filteredProjects.map((project) =>
    translateProject(project, projectCatalog),
  );
  const clients = [...new Set(projects.map((project) => project.client).filter(Boolean))].sort();
  const technologyOptions = [
    ...new Set(projects.flatMap((project) => project.technologies)),
  ].sort();
  const regionOptions = [
    ...new Set(
      projects
        .map((project) => project.location?.split(',').at(-1)?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort();
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="pt-20">
      {/* ═══ HEADER ═══ */}
      <section className="section-padding bg-ja-graphite text-white">
        <div className="container-ja">
          <p className="eyebrow text-white/70 mb-4">{nav('projects')}</p>
          <h1 className="heading-display mb-6 max-w-4xl">{t('h2')}</h1>
          <p className="text-lead text-ja-steel-300 max-w-2xl">{t('lead')}</p>
        </div>
      </section>

      {/* ═══ PROJECTS GRID ═══ */}
      <section className="section-padding bg-ja-surface">
        <div className="container-ja">
          <form
            method="get"
            className="mb-10 border border-ja-line bg-white p-5 sm:p-6"
            aria-label={filterText('formLabel')}
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-sm font-semibold">
                {filterText('industry')}
                <select
                  name="industry"
                  defaultValue={filters.industry}
                  className="mt-2 field-control"
                >
                  <option value="">{filterText('all')}</option>
                  {(
                    [
                      'automotive',
                      'food-beverage',
                      'energy-process',
                      'cosmetics-packaging',
                      'general-industry',
                    ] as Industry[]
                  ).map((value) => (
                    <option key={value} value={value}>
                      {filterText(
                        value === 'food-beverage'
                          ? 'foodBeverage'
                          : value === 'energy-process'
                            ? 'energyProcess'
                            : value === 'cosmetics-packaging'
                              ? 'cosmeticsPackaging'
                              : value === 'general-industry'
                                ? 'generalIndustry'
                                : value,
                      )}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold">
                {filterText('client')}
                <select name="client" defaultValue={filters.client} className="mt-2 field-control">
                  <option value="">{filterText('all')}</option>
                  {clients.map((client) => (
                    <option key={client} value={client}>
                      {client}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold">
                {filterText('technology')}
                <select
                  name="technology"
                  defaultValue={filters.technology}
                  className="mt-2 field-control"
                >
                  <option value="">{filterText('all')}</option>
                  {technologyOptions.map((technology) => (
                    <option key={technology} value={technology}>
                      {technology}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold">
                {filterText('capability')}
                <select
                  name="capability"
                  defaultValue={filters.capability}
                  className="mt-2 field-control"
                >
                  <option value="">{filterText('all')}</option>
                  {(
                    [
                      'plc-hmi-scada',
                      'robotics',
                      'electrical-controls',
                      'simulation',
                      'motion-process',
                      'commissioning',
                      'support',
                      'training-consulting',
                    ] as Capability[]
                  ).map((value) => (
                    <option key={value} value={value}>
                      {filterText(projectCapabilityKeys[value as Capability])}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold">
                {filterText('region')}
                <select name="region" defaultValue={filters.region} className="mt-2 field-control">
                  <option value="">{filterText('all')}</option>
                  {regionOptions.map((region) => (
                    <option key={region} value={region}>
                      {region}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold">
                {filterText('year')}
                <select name="year" defaultValue={filters.year} className="mt-2 field-control">
                  <option value="">{filterText('allYears')}</option>
                  <option value="2020_2026">{filterText('range2020_2026')}</option>
                  <option value="2015_2019">{filterText('range2015_2019')}</option>
                  <option value="2010_2014">{filterText('range2010_2014')}</option>
                  <option value="before_2010">{filterText('before2010')}</option>
                </select>
              </label>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <button type="submit" className="btn btn-primary">
                {filterText('apply')}
              </button>
              {activeFilterCount > 0 && (
                <Link href="/projects" className="text-cta">
                  {filterText('clearFilters')}
                </Link>
              )}
              <span className="text-sm text-ja-steel-500">
                {filterText('projectCount', {
                  shown: filteredProjects.length,
                  total: projects.length,
                })}
              </span>
            </div>
          </form>

          {filteredProjects.length === 0 ? (
            <div className="border border-ja-line bg-white p-8">
              <h2 className="heading-3 text-2xl">{filterText('noResults')}</h2>
              <p className="mt-3 text-ja-steel-700">{filterText('noResultsBody')}</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {localizedFilteredProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.slug}`}
                  className="card group hover:border-ja-red transition-colors block h-full flex-col"
                >
                  <div className="flex justify-between items-start mb-3">
                    <span className="font-[family-name:var(--font-ibm-plex-mono)] text-xs tracking-wider text-ja-steel-500 uppercase">
                      {filterText(projectIndustryKeys[project.industry])}
                    </span>
                    <span className="font-[family-name:var(--font-ibm-plex-mono)] text-xs text-ja-steel-500">
                      {project.displayDate}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold mb-1 group-hover:text-ja-red transition-colors">
                    {project.client ? `${project.client} — ${project.title}` : project.title}
                  </h3>
                  {project.location && (
                    <p className="text-xs text-ja-steel-500 mb-3">{project.location}</p>
                  )}
                  <p className="text-sm text-ja-steel-700 mb-4 leading-relaxed line-clamp-3">
                    {project.scope}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-auto pt-4 border-t border-ja-line">
                    {project.technologies.slice(0, 3).map((t) => (
                      <span key={t} className="chip">
                        {t}
                      </span>
                    ))}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
