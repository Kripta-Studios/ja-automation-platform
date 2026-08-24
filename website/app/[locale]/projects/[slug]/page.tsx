import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link } from '@/lib/i18n/navigation';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { projects } from '@/content/projects';
import { services } from '@/content/services';
import { projectCapabilityKeys, projectIndustryKeys, translateProject } from '@/lib/i18n/content';
import { localizedAlternates } from '@/lib/i18n/metadata';

export function generateStaticParams() {
  return projects.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const project = projects.find((p) => p.slug === slug);

  if (!project) {
    const common = await getTranslations({ locale, namespace: 'common' });
    return {
      title: common('notFound'),
      alternates: localizedAlternates(locale, `/projects/${slug}`),
    };
  }

  const projectCatalog = await getTranslations({ locale, namespace: 'projectCatalog' });
  const localizedProject = translateProject(project, projectCatalog);

  return {
    title: `${localizedProject.client ? `${localizedProject.client} — ` : ''}${localizedProject.title} | J&A Automation`,
    description: localizedProject.scope,
    alternates: localizedAlternates(locale, `/projects/${slug}`),
  };
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const project = projects.find((p) => p.slug === slug);
  if (!project) {
    notFound();
  }

  const common = await getTranslations('common');
  const projectFilters = await getTranslations('projectFilters');
  const projectCatalog = await getTranslations('projectCatalog');
  const localizedProject = translateProject(project, projectCatalog);

  return (
    <div className="pt-20">
      <section className="section-padding bg-ja-surface">
        <div className="container-ja">
          <Link
            href="/projects"
            className="inline-flex items-center gap-2 text-sm font-medium text-ja-steel-500 hover:text-ja-red transition-colors mb-10"
          >
            <ArrowLeft size={16} /> {common('backToProjects')}
          </Link>

          <div className="max-w-4xl">
            <div className="flex flex-wrap items-center gap-4 mb-6">
              <span className="font-[family-name:var(--font-ibm-plex-mono)] text-sm tracking-wider text-ja-red uppercase">
                {projectFilters(projectIndustryKeys[project.industry])}
              </span>
              <span className="text-ja-steel-300">•</span>
              <span className="font-[family-name:var(--font-ibm-plex-mono)] text-sm text-ja-steel-500">
                {localizedProject.displayDate}
              </span>
            </div>

            <h1 className="heading-display text-4xl lg:text-5xl mb-6">
              {localizedProject.client
                ? `${localizedProject.client} — ${localizedProject.title}`
                : localizedProject.title}
            </h1>

            {localizedProject.location && (
              <p className="text-lg text-ja-steel-500 mb-8">{localizedProject.location}</p>
            )}
          </div>
        </div>
      </section>

      <section className="section-padding bg-white">
        <div className="container-ja">
          <div className="grid lg:grid-cols-3 gap-12 lg:gap-20">
            <div className="lg:col-span-2">
              <h2 className="heading-2 text-2xl mb-6">{common('projectScope')}</h2>
              <p className="text-body text-ja-steel-700 mb-10 leading-relaxed whitespace-pre-wrap">
                {localizedProject.scope}
              </p>

              {project.outcome && (
                <>
                  <h2 className="heading-2 text-2xl mb-6">{common('outcome')}</h2>
                  <div className="flex gap-4 p-6 bg-ja-surface rounded-xl border border-ja-line mb-10">
                    <CheckCircle2 className="text-ja-success flex-shrink-0" size={24} />
                    <p className="text-body text-ja-steel-700 leading-relaxed">
                      {localizedProject.outcome}
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="space-y-10">
              {project.capabilities.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-ja-ink mb-4">
                    {common('capabilitiesApplied')}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {project.capabilities.map((cap) => (
                      <Link
                        key={cap}
                        href={`/capabilities/${services.find((service) => service.id === cap)?.slug ?? cap}`}
                        className="chip hover:bg-ja-red hover:text-white hover:border-ja-red transition-colors"
                      >
                        {projectFilters(projectCapabilityKeys[cap])}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {project.technologies.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-ja-ink mb-4">
                    {common('technologies')}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {project.technologies.map((tech) => (
                      <span
                        key={tech}
                        className="chip bg-ja-surface border-ja-line text-ja-steel-700"
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="section-padding bg-ja-graphite text-white text-center">
        <div className="container-ja">
          <h2 className="heading-2 mb-6">{common('discussSimilarProject')}</h2>
          <div className="flex flex-col sm:flex-row justify-center gap-3">
            <Link href={`/contact?intent=project`} className="btn btn-primary">
              {common('contactEngineeringTeam')}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
