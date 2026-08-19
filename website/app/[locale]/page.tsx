import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n/navigation';
import Image from 'next/image';
import {
  ArrowRight,
  Cpu,
  Bot,
  MonitorPlay,
  Zap,
  Gauge,
  HardHat,
  GraduationCap,
} from 'lucide-react';
import assemblyImg from '@/public/images/capabilities/assembly-engines.jpg';
import logoImg from '@/public/brand/logo-jaautomation.png';
import { HeroCrossfade } from '@/components/hero/HeroCrossfade';
import { ClientExperience } from '@/components/home/ClientExperience';
import { IndustryShowcase } from '@/components/home/IndustryShowcase';
import { services } from '@/content/services';
import { featuredProjects } from '@/content/projects';
import { contact, teamRoles } from '@/content/company';
import { technologies, technologyGroups } from '@/content/technologies';

const iconMap: Record<string, React.ReactNode> = {
  Cpu: <Cpu size={24} />,
  Bot: <Bot size={24} />,
  MonitorPlay: <MonitorPlay size={24} />,
  Zap: <Zap size={24} />,
  Gauge: <Gauge size={24} />,
  HardHat: <HardHat size={24} />,
  GraduationCap: <GraduationCap size={24} />,
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

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const hero = await getTranslations('hero');
  const proof = await getTranslations('proof');
  const intro = await getTranslations('intro');
  const cap = await getTranslations('capabilities');
  const proj = await getTranslations('projectExperience');
  const tech = await getTranslations('techEcosystem');
  const delivery = await getTranslations('delivery');
  const remote = await getTranslations('remoteSupport');
  const team = await getTranslations('team');
  const aquarex = await getTranslations('aquarexTeaser');
  const careers = await getTranslations('careersTeaser');
  const final = await getTranslations('finalCta');

  return (
    <>
      {/* ═══ HERO ═══ */}
      <section id="home" className="relative">
        <HeroCrossfade />
        <div className="absolute inset-0 z-10 flex items-center pt-24 lg:pt-28">
          <div className="container-ja">
            <div className="max-w-2xl">
              <Image
                src={logoImg}
                alt="J&A Automation Industrial Solutions"
                className="mb-6 h-28 w-auto drop-shadow-[0_8px_24px_rgba(0,0,0,0.35)] sm:h-32 lg:h-40"
                priority
                sizes="(max-width: 640px) 112px, (max-width: 1024px) 128px, 160px"
              />
              <p className="eyebrow text-white/70 mb-5">{hero('eyebrow')}</p>
              <h1 className="heading-display text-white mb-6">{hero('h1')}</h1>
              <p className="text-lg text-white/80 leading-relaxed mb-8 max-w-xl">{hero('body')}</p>
              <div className="translate-y-5 lg:translate-y-8">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row">
                  <Link href="/contact?intent=project" className="btn btn-primary">
                    {hero('cta')}
                  </Link>
                  <Link href="/capabilities" className="btn btn-secondary-dark">
                    {hero('ctaSecondary')}
                  </Link>
                </div>
                <Link
                  href="/contact?intent=support"
                  className="inline-flex items-center gap-2 text-sm text-white/60 transition-colors hover:text-white/90"
                >
                  {hero('supportLink')}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <IndustryShowcase />

      {/* ═══ PROOF STRIP ═══ */}
      <section className="bg-ja-graphite py-5 border-y border-white/10">
        <div className="container-ja">
          <div className="flex flex-wrap justify-center lg:justify-between items-center gap-6 lg:gap-4">
            {[proof('since'), proof('operations'), proof('offices'), proof('support')].map(
              (item) => (
                <span
                  key={item}
                  className="font-[family-name:var(--font-ibm-plex-mono)] text-xs tracking-[0.14em] text-ja-steel-300 uppercase"
                >
                  {item}
                </span>
              ),
            )}
          </div>
        </div>
      </section>

      {/* ═══ INTRO / VALUE PROPOSITION ═══ */}
      <section id="about" className="section-padding-lg bg-white">
        <div className="container-ja">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <div>
              <p className="eyebrow mb-4">{intro('eyebrow')}</p>
              <div className="lines-motif mb-6" aria-hidden="true" />
              <h2 className="heading-2 mb-6">{intro('h2')}</h2>
              <p className="text-lead mb-4">{intro('p1')}</p>
              <p className="text-body text-ja-steel-700 mb-8">{intro('p2')}</p>
              <Link href="/about" className="text-cta">
                {intro('cta')} <ArrowRight size={16} />
              </Link>
            </div>
            <div className="relative rounded-[14px] overflow-hidden aspect-[16/10]">
              <Image
                src={assemblyImg}
                alt="State of the art automated assembly line"
                fill
                className="object-cover transition-transform duration-700 hover:scale-105"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
              <div className="absolute bottom-0 left-0 right-0 px-5 py-3 bg-gradient-to-t from-black/60 to-transparent">
                <span className="font-[family-name:var(--font-ibm-plex-mono)] text-[0.7rem] tracking-[0.14em] text-white/70 uppercase">
                  {intro('imageCaption')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ CAPABILITIES GRID ═══ */}
      <section id="services" className="section-padding bg-ja-surface">
        <div className="container-ja">
          <p className="eyebrow mb-4">{cap('eyebrow')}</p>
          <h2 className="heading-2 mb-4 max-w-3xl">{cap('h2')}</h2>
          <p className="text-lead mb-12 max-w-2xl">{cap('lead')}</p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {services.map((service) => {
              const key = capabilityKeys[service.id] ?? service.id;
              return (
                <Link
                  key={service.id}
                  href={`/capabilities/${service.slug}`}
                  className="card group"
                >
                  <div className="text-ja-red mb-4">{iconMap[service.icon]}</div>
                  <h3 className="heading-3 text-lg mb-2">{cap(key)}</h3>
                  <p className="text-sm text-ja-steel-700 mb-4 leading-relaxed">
                    {cap(`${key}Desc`)}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-auto">
                    {service.tags.map((tag) => (
                      <span key={tag} className="chip">
                        {tag}
                      </span>
                    ))}
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="mt-10 text-center">
            <Link href="/capabilities" className="text-cta">
              {cap('cta')} <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <ClientExperience />

      <section id="technology" className="section-padding bg-ja-graphite text-white">
        <div className="container-ja">
          <p className="eyebrow text-ja-red mb-4">{tech('eyebrow')}</p>
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
            <div>
              <h2 className="heading-2 mb-5">{tech('h2')}</h2>
              <p className="text-lead text-ja-steel-300 max-w-xl">{tech('lead')}</p>
            </div>
            <div className="grid gap-px border border-white/15 bg-white/15 sm:grid-cols-2">
              {technologyGroups.map((group) => (
                <div key={group.labelKey} className="bg-ja-charcoal p-6 sm:p-7">
                  <h3 className="font-[family-name:var(--font-ibm-plex-mono)] text-xs uppercase tracking-[0.14em] text-ja-steel-300">
                    {tech(group.labelKey.replace(/^tech\./, ''))}
                  </h3>
                  <ul className="mt-5 space-y-2 text-sm text-white/85">
                    {group.ids.map((id) => {
                      const item = technologies.find((technology) => technology.id === id);
                      return item ? <li key={id}>{item.name}</li> : null;
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="delivery" className="section-padding bg-ja-surface">
        <div className="container-ja">
          <p className="eyebrow mb-4">{delivery('eyebrow')}</p>
          <h2 className="heading-2 mb-12 max-w-3xl">{delivery('h2')}</h2>
          <ol className="grid gap-5 md:grid-cols-2 lg:grid-cols-5">
            {(['step1', 'step2', 'step3', 'step4', 'step5'] as const).map((step, index) => (
              <li key={step} className="border-t-2 border-ja-red pt-5">
                <span className="font-[family-name:var(--font-ibm-plex-mono)] text-xs text-ja-red">
                  0{index + 1}
                </span>
                <h3 className="heading-3 mt-3 text-xl">{delivery(step)}</h3>
                <p className="mt-3 text-sm leading-relaxed text-ja-steel-700">
                  {delivery(`${step}Desc`)}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="support" className="section-padding bg-white">
        <div className="container-ja">
          <div className="grid gap-10 lg:grid-cols-[1fr_0.85fr] lg:items-center">
            <div>
              <p className="eyebrow mb-4">{remote('eyebrow')}</p>
              <h2 className="heading-2 mb-5 max-w-3xl">{remote('h2')}</h2>
              <p className="text-lead max-w-2xl">{remote('body')}</p>
              <p className="mt-5 max-w-2xl text-sm text-ja-steel-700">{remote('helper')}</p>
              <Link href="/contact?intent=support" className="btn btn-primary mt-8">
                {remote('cta')} <ArrowRight size={16} />
              </Link>
            </div>
            <div className="border border-ja-line bg-ja-surface p-7 sm:p-9">
              <p className="eyebrow-steel mb-5">Field + remote coverage</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                {['PLC / HMI', 'Robotics', 'Drives + motion', 'Production startup'].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 border-b border-ja-line pb-3 text-sm font-semibold"
                  >
                    <span className="h-2 w-2 bg-ja-red" aria-hidden="true" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="team" className="section-padding bg-ja-surface">
        <div className="container-ja">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
            <div>
              <p className="eyebrow mb-4">{team('eyebrow')}</p>
              <h2 className="heading-2 mb-5">{team('h2')}</h2>
              <p className="text-lead">{team('body')}</p>
              <Link href="/about" className="text-cta mt-7 inline-flex">
                {team('cta')} <ArrowRight size={16} />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-px border border-ja-line bg-ja-line sm:grid-cols-3">
              {teamRoles.map((role) => (
                <div key={role.labelKey} className="bg-white p-5 sm:p-6">
                  <strong className="block text-3xl font-semibold text-ja-red">{role.count}</strong>
                  <span className="mt-2 block text-sm text-ja-steel-700">
                    {team(role.labelKey.replace(/^team\./, ''))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="aquarex" className="section-padding bg-ja-graphite text-white">
        <div className="container-ja">
          <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="max-w-3xl">
              <p className="eyebrow text-ja-red mb-4">{aquarex('eyebrow')}</p>
              <h2 className="heading-2 mb-5">{aquarex('h2')}</h2>
              <p className="text-lead text-ja-steel-300">{aquarex('body')}</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <Link href="/solutions/aquarex" className="btn btn-primary">
                {aquarex('cta')}
              </Link>
              <Link href="/contact?intent=aquarex" className="btn btn-secondary-dark">
                {aquarex('ctaSecondary')}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section id="careers" className="section-padding bg-ja-surface">
        <div className="container-ja">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="max-w-3xl">
              <p className="eyebrow mb-4">{careers('eyebrow')}</p>
              <h2 className="heading-2 mb-5">{careers('h2')}</h2>
              <p className="text-lead">{careers('body')}</p>
            </div>
            <Link href="/careers" className="btn btn-secondary">
              {careers('cta')} <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ SELECTED PROJECT EXPERIENCE ═══ */}
      <section id="works" className="section-padding bg-white">
        <div className="container-ja">
          <p className="eyebrow mb-4">{proj('eyebrow')}</p>
          <h2 className="heading-2 mb-4 max-w-3xl">{proj('h2')}</h2>
          <p className="text-lead mb-12 max-w-2xl">{proj('lead')}</p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {featuredProjects.map((project) => (
              <div key={project.id} className="card">
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
                  {project.technologies.slice(0, 3).map((t) => (
                    <span key={t} className="chip">
                      {t}
                    </span>
                  ))}
                  {project.capabilities.slice(0, 2).map((c) => (
                    <span key={c} className="chip">
                      {c.replace(/-/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <Link href="/projects" className="text-cta">
              {proj('cta')} <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ FINAL CONVERSION BAND ═══ */}
      <section id="contact" className="section-padding bg-ja-graphite relative overflow-hidden">
        <div id="question" className="absolute top-0" aria-hidden="true" />
        <div className="absolute top-0 left-0 w-full h-1 bg-ja-red" aria-hidden="true" />
        <div className="container-ja text-center relative z-10">
          <h2 className="heading-2 text-white mb-4 max-w-3xl mx-auto">{final('h2')}</h2>
          <p className="text-lead text-ja-steel-300 mb-8 max-w-xl mx-auto">{final('body')}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-10">
            <Link href="/contact?intent=project" className="btn btn-primary">
              {final('ctaPrimary')}
            </Link>
            <Link href="/contact?intent=support" className="btn btn-secondary-dark">
              {final('ctaSupport')}
            </Link>
          </div>
          <div className="flex flex-col sm:flex-row justify-center gap-6 text-sm">
            <a
              href={`mailto:${contact.email}`}
              className="text-ja-steel-300 hover:text-white transition-colors"
            >
              {contact.email}
            </a>
            <a
              href={`tel:${contact.usPhone.replace(/[^\d+]/g, '')}`}
              className="text-ja-steel-300 hover:text-white transition-colors"
            >
              {contact.usPhone}
            </a>
            <a
              href={contact.linkedinUrl}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-sky-400 underline decoration-sky-400/40 underline-offset-4 transition-colors hover:text-sky-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-400"
            >
              {contact.primaryName} · {contact.primaryTitle}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
