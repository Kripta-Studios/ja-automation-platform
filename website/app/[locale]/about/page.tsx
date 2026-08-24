import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n/navigation';
import Image from 'next/image';
import assemblyImg from '@/public/images/capabilities/assembly-engines.webp';
import { company } from '@/content/company';
import { LinesMotif } from '@/components/ui/LinesMotif';
import { localizedAlternates } from '@/lib/i18n/metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  return {
    title: t('aboutTitle'),
    description: t('aboutDescription'),
    alternates: localizedAlternates(locale, '/about'),
  };
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('about');
  const imageAlt = await getTranslations('imageAlts');

  return (
    <div className="pt-20">
      {/* ═══ HEADER ═══ */}
      <section className="section-padding bg-ja-surface">
        <div className="container-ja">
          <p className="eyebrow mb-4">{t('eyebrow')}</p>
          <LinesMotif className="mb-6" />
          <h1 className="heading-display mb-6 max-w-4xl">{t('h1')}</h1>
          <p className="text-lead text-ja-steel-700 max-w-2xl mb-12">{t('lead')}</p>

          <div className="relative rounded-[14px] overflow-hidden aspect-[21/9]">
            <Image
              src={assemblyImg}
              alt={imageAlt('assembly')}
              fill
              className="object-cover transition-transform duration-700 group-hover:scale-105"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </div>
        </div>
      </section>

      {/* ═══ OUR STORY ═══ */}
      <section className="section-padding bg-white">
        <div className="container-ja">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20">
            <div>
              <h2 className="heading-2 mb-6">{t('storyH2')}</h2>
              <p className="text-body text-ja-steel-700 mb-6 leading-relaxed">{t('storyP1')}</p>
              <p className="text-body text-ja-steel-700 mb-6 leading-relaxed">{t('storyP2')}</p>
              <p className="text-body text-ja-steel-700 leading-relaxed">{t('storyP3')}</p>
            </div>

            <div className="bg-ja-graphite rounded-xl p-8 lg:p-12 text-white flex flex-col justify-center">
              <div className="space-y-8">
                <div>
                  <p className="text-4xl font-bold text-ja-red mb-2">{company.founded}</p>
                  <p className="text-sm text-ja-steel-300 uppercase tracking-wider">
                    {t('founded')}
                  </p>
                </div>
                <div>
                  <p className="text-4xl font-bold text-ja-red mb-2">{company.officeCount}</p>
                  <p className="text-sm text-ja-steel-300 uppercase tracking-wider">
                    {t('offices')}
                  </p>
                </div>
                <div>
                  <p className="text-4xl font-bold text-ja-red mb-2">1,000+</p>
                  <p className="text-sm text-ja-steel-300 uppercase tracking-wider">
                    {t('projectsCompleted')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ PHILOSOPHY ═══ */}
      <section className="section-padding bg-ja-surface">
        <div className="container-ja">
          <h2 className="heading-2 text-center mb-16">{t('principlesH2')}</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="card">
              <h3 className="text-lg font-semibold mb-3">{t('principle1Title')}</h3>
              <p className="text-sm text-ja-steel-700 leading-relaxed">{t('principle1Body')}</p>
            </div>
            <div className="card">
              <h3 className="text-lg font-semibold mb-3">{t('principle2Title')}</h3>
              <p className="text-sm text-ja-steel-700 leading-relaxed">{t('principle2Body')}</p>
            </div>
            <div className="card">
              <h3 className="text-lg font-semibold mb-3">{t('principle3Title')}</h3>
              <p className="text-sm text-ja-steel-700 leading-relaxed">{t('principle3Body')}</p>
            </div>
            <div className="card">
              <h3 className="text-lg font-semibold mb-3">{t('principle4Title')}</h3>
              <p className="text-sm text-ja-steel-700 leading-relaxed">{t('principle4Body')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ TEAM CTA ═══ */}
      <section className="section-padding bg-white">
        <div className="container-ja text-center">
          <h2 className="heading-2 mb-6">{t('joinTeam')}</h2>
          <p className="text-lead text-ja-steel-700 max-w-2xl mx-auto mb-10">{t('joinTeamBody')}</p>
          <Link href="/careers" className="btn btn-secondary-dark">
            {t('careerOpportunities')}
          </Link>
        </div>
      </section>
    </div>
  );
}
