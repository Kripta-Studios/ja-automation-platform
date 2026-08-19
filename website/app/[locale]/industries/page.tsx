import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n/navigation';
import { ArrowRight } from 'lucide-react';
import { industries } from '@/content/industries';
import Image, { type StaticImageData } from 'next/image';
import autoImg from '@/public/images/industries/automotive-body-shop.jpg';
import foodBevImg from '@/public/images/hero/hero-food-beverage.jpg';
import energyImg from '@/public/images/hero/hero-energy-process.jpg';
import cosmeticsImg from '@/public/images/industries/cosmetics-filling.jpg';
import roboticsImg from '@/public/images/industries/robotics-cell-square.jpg';

const industryImages: Record<string, { src: StaticImageData; alt: string; position: string }> = {
  automotive: { src: autoImg, alt: 'Industrial robotic automotive body shop', position: '53% 50%' },
  foodBeverage: { src: foodBevImg, alt: 'Food and beverage production line', position: '48% 50%' },
  energyProcess: {
    src: energyImg,
    alt: 'Energy and process industrial plant',
    position: '50% 55%',
  },
  cosmeticsPackaging: {
    src: cosmeticsImg,
    alt: 'Cosmetics filling production line',
    position: '48% 52%',
  },
  oemGeneral: { src: roboticsImg, alt: 'Industrial robotic cell', position: '50% 50%' },
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

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  return {
    title: t('capabilitiesTitle')
      .replace('Services', 'Industries')
      .replace('Serviços', 'Indústrias'),
    description: t('projectsDescription'),
  };
}

export default async function IndustriesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('industries');

  return (
    <div className="pt-20">
      {/* ═══ HEADER ═══ */}
      <section className="section-padding bg-ja-graphite text-white">
        <div className="container-ja">
          <p className="eyebrow text-white/70 mb-4">{t('eyebrow')}</p>
          <h1 className="heading-display mb-6 max-w-4xl">{t('h2')}</h1>
          <p className="text-lead text-ja-steel-300 max-w-2xl">
            J&A Automation builds, integrates, and supports industrial control systems across
            multiple sectors.
          </p>
        </div>
      </section>

      {/* ═══ INDUSTRIES LIST ═══ */}
      <section className="section-padding bg-white">
        <div className="container-ja">
          <div className="grid lg:grid-cols-2 gap-x-12 gap-y-16">
            {industries.map((ind) => {
              const key = indKeyMap[ind.id] ?? ind.id;
              const img = industryImages[ind.imageKey];
              return (
                <div key={ind.id} className="flex flex-col h-full">
                  <Link
                    href={`/industries/${ind.slug}`}
                    className="group relative rounded-[14px] overflow-hidden aspect-[16/9] mb-6 block"
                  >
                    <Image
                      src={img.src}
                      alt={img.alt}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.025]"
                      style={{ objectPosition: img.position }}
                      sizes="(max-width: 1024px) 100vw, 50vw"
                    />
                    <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors duration-300" />
                  </Link>
                  <h2 className="heading-2 text-3xl mb-4">{t(key as IndustryMessageKey)}</h2>
                  <p className="text-body text-ja-steel-700 mb-6 leading-relaxed flex-grow">
                    {t(`${key}Desc` as `${IndustryMessageKey}Desc`)}
                  </p>
                  <Link href={`/industries/${ind.slug}`} className="text-cta">
                    View projects in this industry <ArrowRight size={16} />
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
