import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link } from '@/lib/i18n/navigation';
import { ArrowLeft } from 'lucide-react';
import autoImg from '@/public/images/industries/automotive-body-shop.webp';
import foodBevImg from '@/public/images/hero/hero-food-beverage.webp';
import energyImg from '@/public/images/hero/hero-energy-process.webp';
import cosmeticsImg from '@/public/images/industries/cosmetics-filling.webp';
import roboticsImg from '@/public/images/industries/robotics-cell-square.webp';
import { industries } from '@/content/industries';
import { projects } from '@/content/projects';
import Image, { type StaticImageData } from 'next/image';
import { projectCapabilityKeys, translateProject } from '@/lib/i18n/content';
import { LinesMotif } from '@/components/ui/LinesMotif';
import { localizedAlternates } from '@/lib/i18n/metadata';

const industryImages: Record<
  string,
  {
    src: StaticImageData;
    altKey: 'automotive' | 'foodBeverage' | 'energyProcess' | 'cosmeticsPackaging' | 'oemGeneral';
    position: string;
  }
> = {
  automotive: { src: autoImg, altKey: 'automotive', position: '53% 50%' },
  foodBeverage: { src: foodBevImg, altKey: 'foodBeverage', position: '48% 50%' },
  energyProcess: {
    src: energyImg,
    altKey: 'energyProcess',
    position: '50% 55%',
  },
  cosmeticsPackaging: {
    src: cosmeticsImg,
    altKey: 'cosmeticsPackaging',
    position: '48% 52%',
  },
  oemGeneral: { src: roboticsImg, altKey: 'oemGeneral', position: '50% 50%' },
};

const indKeyMap: Record<string, string> = {
  automotive: 'automotive',
  'food-beverage': 'foodBeverage',
  'energy-process': 'energyProcess',
  'cosmetics-packaging': 'cosmeticsPackaging',
  'general-industry': 'oemGeneral',
};

type IndustryMessageKey =
  | 'automotive'
  | 'foodBeverage'
  | 'energyProcess'
  | 'cosmeticsPackaging'
  | 'oemGeneral';

export function generateStaticParams() {
  return industries.map((ind) => ({ slug: ind.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const industry = industries.find((i) => i.slug === slug);

  if (!industry) {
    const common = await getTranslations({ locale, namespace: 'common' });
    return {
      title: common('notFound'),
      alternates: localizedAlternates(locale, `/industries/${slug}`),
    };
  }

  const t = await getTranslations({ locale, namespace: 'industries' });
  const key = indKeyMap[industry.id] ?? industry.id;

  return {
    title: `${t(key as IndustryMessageKey)} | J&A Automation`,
    description: t(`${key}Desc` as `${IndustryMessageKey}Desc`),
    alternates: localizedAlternates(locale, `/industries/${slug}`),
  };
}

export default async function IndustryDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const industry = industries.find((i) => i.slug === slug);
  if (!industry) {
    notFound();
  }

  const t = await getTranslations('industries');
  const nav = await getTranslations('nav');
  const common = await getTranslations('common');
  const imageAlt = await getTranslations('imageAlts');
  const projectFilters = await getTranslations('projectFilters');
  const projectCatalog = await getTranslations('projectCatalog');
  const key = indKeyMap[industry.id] ?? industry.id;
  const img = industryImages[industry.imageKey];

  // Find related projects
  const relatedProjects = projects
    .filter((p) => p.industry === industry.id)
    .sort((a, b) => (b.sortWeight ?? 0) - (a.sortWeight ?? 0));
  const localizedRelatedProjects = relatedProjects.map((project) =>
    translateProject(project, projectCatalog),
  );

  return (
    <div className="pt-20">
      <section className="section-padding bg-ja-surface">
        <div className="container-ja">
          <Link
            href="/industries"
            className="inline-flex items-center gap-2 text-sm font-medium text-ja-steel-500 hover:text-ja-red transition-colors mb-10"
          >
            <ArrowLeft size={16} /> {common('backToIndustries')}
          </Link>

          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <div>
              <p className="eyebrow mb-4">{nav('industries')}</p>
              <LinesMotif className="mb-6" />
              <h1 className="heading-display text-4xl lg:text-5xl">
                {t(key as IndustryMessageKey)}
              </h1>
              <p className="text-lead text-ja-steel-700">
                {t(`${key}Desc` as `${IndustryMessageKey}Desc`)}
              </p>
            </div>

            <div className="relative rounded-[14px] overflow-hidden aspect-[16/10]">
              <Image
                src={img.src}
                alt={imageAlt(img.altKey)}
                fill
                className="object-cover"
                style={{ objectPosition: img.position }}
                sizes="(max-width: 1024px) 100vw, 50vw"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      {relatedProjects.length > 0 && (
        <section className="section-padding bg-white border-t border-ja-line">
          <div className="container-ja">
            <h2 className="heading-2 mb-10 text-3xl">{common('projectExperience')}</h2>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {localizedRelatedProjects.map((project) => (
                <div key={project.id} className="card">
                  <div className="flex justify-between items-start mb-3">
                    <span className="font-[family-name:var(--font-ibm-plex-mono)] text-xs text-ja-steel-500">
                      {project.displayDate}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold mb-1">
                    {project.client ? `${project.client} — ${project.title}` : project.title}
                  </h3>
                  {project.location && (
                    <p className="text-xs text-ja-steel-500 mb-3">{project.location}</p>
                  )}
                  <p className="text-sm text-ja-steel-700 mb-4 leading-relaxed line-clamp-3">
                    {project.scope}
                  </p>
                  {project.outcome && (
                    <p className="text-sm text-ja-success font-medium mb-4">{project.outcome}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5 mt-auto">
                    {project.technologies.slice(0, 3).map((tech) => (
                      <span key={tech} className="chip">
                        {tech}
                      </span>
                    ))}
                    {project.capabilities.slice(0, 2).map((c) => (
                      <span key={c} className="chip">
                        {projectFilters(projectCapabilityKeys[c])}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA Section */}
      <section className="section-padding bg-ja-graphite text-white text-center">
        <div className="container-ja">
          <h2 className="heading-2 mb-6">{common('needSectorSupport')}</h2>
          <div className="flex flex-col sm:flex-row justify-center gap-3">
            <Link href={`/contact?intent=project`} className="btn btn-primary">
              {nav('talkToEngineer')}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
