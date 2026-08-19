import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Link } from '@/lib/i18n/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Cpu,
  Bot,
  MonitorPlay,
  Zap,
  Gauge,
  HardHat,
  GraduationCap,
} from 'lucide-react';
import { services } from '@/content/services';
import { projects } from '@/content/projects';

type CapabilityMessageKey =
  | 'plcHmiScada'
  | 'robotics'
  | 'simulation'
  | 'electricalControls'
  | 'motionProcess'
  | 'commissioning'
  | 'supportTraining';

const iconMap: Record<string, React.ReactNode> = {
  Cpu: <Cpu size={32} />,
  Bot: <Bot size={32} />,
  MonitorPlay: <MonitorPlay size={32} />,
  Zap: <Zap size={32} />,
  Gauge: <Gauge size={32} />,
  HardHat: <HardHat size={32} />,
  GraduationCap: <GraduationCap size={32} />,
};

const capabilityKeys: Record<string, string> = {
  'plc-hmi-scada': 'plcHmiScada',
  robotics: 'robotics',
  simulation: 'simulation',
  'electrical-controls': 'electricalControls',
  'motion-process': 'motionProcess',
  commissioning: 'commissioning',
  'training-consulting': 'supportTraining',
};

// Generate static routes for all capabilities
export function generateStaticParams() {
  return services.map((service) => ({ slug: service.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const service = services.find((s) => s.slug === slug);

  if (!service) {
    return { title: 'Not Found' };
  }

  const t = await getTranslations({ locale, namespace: 'capabilities' });
  const key = capabilityKeys[service.id] ?? service.id;

  return {
    title: `${t(key as CapabilityMessageKey)} | J&A Automation`,
    description: t(`${key}Desc` as `${CapabilityMessageKey}Desc`),
  };
}

export default async function CapabilityDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const service = services.find((s) => s.slug === slug);
  if (!service) {
    notFound();
  }

  const t = await getTranslations('capabilities');
  const nav = await getTranslations('nav');
  const key = capabilityKeys[service.id] ?? service.id;

  // Find related projects
  const relatedProjects = projects
    .filter((p) => p.capabilities.includes(service.id))
    .sort((a, b) => (b.sortWeight ?? 0) - (a.sortWeight ?? 0))
    .slice(0, 3);

  return (
    <div className="pt-20">
      <section className="section-padding bg-ja-surface">
        <div className="container-ja">
          <Link
            href="/capabilities"
            className="inline-flex items-center gap-2 text-sm font-medium text-ja-steel-500 hover:text-ja-red transition-colors mb-10"
          >
            <ArrowLeft size={16} /> Back to Capabilities
          </Link>

          <div className="flex items-center gap-4 mb-6 text-ja-red">
            {iconMap[service.icon]}
            <p className="eyebrow !mb-0">{nav('capabilities')}</p>
          </div>

          <h1 className="heading-display text-4xl lg:text-5xl mb-6 max-w-4xl">
            {t(key as CapabilityMessageKey)}
          </h1>

          <p className="text-lead text-ja-steel-700 max-w-3xl mb-8">
            {t(`${key}Desc` as `${CapabilityMessageKey}Desc`)}
          </p>

          <div className="flex flex-wrap gap-2">
            {service.tags.map((tag) => (
              <span key={tag} className="chip bg-white">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      {relatedProjects.length > 0 && (
        <section className="section-padding bg-white border-t border-ja-line">
          <div className="container-ja">
            <h2 className="heading-2 mb-10 text-3xl">Related Project Experience</h2>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {relatedProjects.map((project) => (
                <div key={project.id} className="card">
                  <div className="flex justify-between items-start mb-3">
                    <span className="font-[family-name:var(--font-ibm-plex-mono)] text-xs tracking-wider text-ja-steel-500 uppercase">
                      {project.industry.replace('-', ' / ')}
                    </span>
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
                  <div className="flex flex-wrap gap-1.5 mt-auto">
                    {project.technologies.slice(0, 3).map((tech) => (
                      <span key={tech} className="chip">
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-10">
              <Link href="/projects" className="text-cta">
                View all projects <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* CTA Section */}
      <section className="section-padding bg-ja-graphite text-white text-center">
        <div className="container-ja">
          <h2 className="heading-2 mb-6">
            Need engineering support for {t(key as CapabilityMessageKey).toLowerCase()}?
          </h2>
          <div className="flex flex-col sm:flex-row justify-center gap-3">
            <Link
              href={`/contact?intent=project&service=${service.id}`}
              className="btn btn-primary"
            >
              Talk to an Engineer
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
