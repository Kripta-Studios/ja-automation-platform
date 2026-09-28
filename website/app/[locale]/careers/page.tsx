import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n/navigation';
import { ArrowRight, BriefcaseBusiness, MapPin } from 'lucide-react';
import { localizedAlternates } from '@/lib/i18n/metadata';

const profiles = ['profile1', 'profile2', 'profile3', 'profile4', 'profile5', 'profile6'] as const;
const work = ['work1', 'work2', 'work3', 'work4', 'work5', 'work6', 'work7', 'work8'] as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  return {
    title: t('careersTitle'),
    description: t('careersDescription'),
    alternates: localizedAlternates(locale, '/careers'),
  };
}

export default async function CareersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('careers');
  const nav = await getTranslations('nav');

  return (
    <div className="pt-20">
      <section className="section-padding bg-ja-graphite text-white">
        <div className="container-ja">
          <p className="eyebrow text-white/70 mb-4">{t('eyebrow')}</p>
          <h1 className="heading-display mb-6 max-w-4xl">{t('h1')}</h1>
          <p className="text-lead text-ja-steel-300 max-w-2xl mb-8">{t('lead')}</p>
          <Link href="/contact?intent=career" className="btn btn-primary">
            {t('ctaPrimary')} <ArrowRight size={17} />
          </Link>
        </div>
      </section>

      <section className="section-padding bg-white">
        <div className="container-ja grid lg:grid-cols-2 gap-12 lg:gap-20">
          <div>
            <p className="eyebrow mb-4">{t('profilesHeading')}</p>
            <h2 className="heading-2 mb-6">{t('ctaH2')}</h2>
            <p className="text-body text-ja-steel-700 leading-relaxed">{t('ctaBody')}</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {profiles.map((key) => (
              <article key={key} className="bg-ja-surface p-5 rounded-xl border border-ja-line">
                <BriefcaseBusiness size={19} className="text-ja-red mb-4" aria-hidden="true" />
                <h3 className="font-semibold text-ja-ink">{t(key)}</h3>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section-padding bg-ja-surface border-y border-ja-line">
        <div className="container-ja grid lg:grid-cols-[0.8fr_1.2fr] gap-12 items-start">
          <div>
            <p className="eyebrow mb-4">{t('workHeading')}</p>
            <h2 className="heading-2">{t('workH2')}</h2>
          </div>
          <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
            {work.map((key) => (
              <li key={key} className="flex gap-3 items-start text-ja-steel-700">
                <MapPin size={17} className="mt-0.5 text-ja-red shrink-0" aria-hidden="true" />
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section-padding bg-white">
        <div className="container-ja max-w-3xl">
          <div className="bg-ja-graphite text-white rounded-2xl p-8 md:p-12">
            <p className="eyebrow text-white/60 mb-4">{nav('careers')}</p>
            <h2 className="heading-2 mb-4">{t('ctaH2')}</h2>
            <p className="text-ja-steel-300 mb-7">{t('ctaBody')}</p>
            <Link href="/contact?intent=career" className="text-cta text-white hover:text-white/80">
              {t('ctaSecondary')} <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
