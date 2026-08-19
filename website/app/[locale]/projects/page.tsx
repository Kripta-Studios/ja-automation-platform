import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n/navigation';
import { projects } from '@/content/projects';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  return {
    title: t('projectsTitle'),
    description: t('projectsDescription'),
  };
}

export default async function ProjectsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('projectExperience');
  const nav = await getTranslations('nav');

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
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.slug}`}
                className="card group hover:border-ja-red transition-colors block h-full flex-col"
              >
                <div className="flex justify-between items-start mb-3">
                  <span className="font-[family-name:var(--font-ibm-plex-mono)] text-xs tracking-wider text-ja-steel-500 uppercase">
                    {project.industry
                      .replace('-', ' / ')
                      .replace('food / beverage', 'Food & Beverage')}
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
        </div>
      </section>
    </div>
  );
}
