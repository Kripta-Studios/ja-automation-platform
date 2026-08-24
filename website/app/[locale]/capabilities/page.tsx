import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n/navigation';
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
import { services } from '@/content/services';
import { translateServiceTags } from '@/lib/i18n/content';
import { localizedAlternates } from '@/lib/i18n/metadata';

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

type CapabilityMessageKey =
  | 'plcHmiScada'
  | 'robotics'
  | 'simulation'
  | 'electricalControls'
  | 'motionProcess'
  | 'commissioning'
  | 'supportTraining';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  return {
    title: t('capabilitiesTitle'),
    description: t('capabilitiesDescription'),
    alternates: localizedAlternates(locale, '/capabilities'),
  };
}

export default async function CapabilitiesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('capabilities');
  const serviceTags = await getTranslations('serviceTags');

  return (
    <div className="pt-20">
      {/* ═══ HEADER ═══ */}
      <section className="section-padding bg-ja-graphite text-white">
        <div className="container-ja">
          <p className="eyebrow text-white/70 mb-4">{t('eyebrow')}</p>
          <h1 className="heading-display mb-6 max-w-4xl">{t('h2')}</h1>
          <p className="text-lead text-ja-steel-300 max-w-2xl">{t('lead')}</p>
        </div>
      </section>

      {/* ═══ CAPABILITIES LIST ═══ */}
      <section className="section-padding bg-white">
        <div className="container-ja">
          <div className="grid lg:grid-cols-2 gap-x-12 gap-y-16">
            {services.map((service) => {
              const key = capabilityKeys[service.id] ?? service.id;
              return (
                <div key={service.id} className="flex flex-col h-full border-t border-ja-line pt-8">
                  <div className="text-ja-red mb-6">{iconMap[service.icon]}</div>
                  <h2 className="heading-2 text-3xl mb-4">{t(key as CapabilityMessageKey)}</h2>
                  <p className="text-body text-ja-steel-700 mb-6 leading-relaxed max-w-xl flex-grow">
                    {t(`${key}Desc` as `${CapabilityMessageKey}Desc`)}
                  </p>
                  <div className="flex flex-wrap gap-2 mb-8">
                    {translateServiceTags(service.tags, serviceTags).map((tag) => (
                      <span key={tag} className="chip">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <Link
                    href={`/capabilities/${service.slug}`}
                    className="text-cta mt-auto inline-flex"
                  >
                    {t('explore')} <ArrowRight size={16} />
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
