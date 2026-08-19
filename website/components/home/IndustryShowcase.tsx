import Image, { type StaticImageData } from 'next/image';
import { getTranslations } from 'next-intl/server';
import { ArrowRight } from 'lucide-react';

import { Link } from '@/lib/i18n/navigation';
import autoImg from '@/public/images/industries/automotive-body-shop.jpg';
import foodBevImg from '@/public/images/hero/hero-food-beverage.jpg';
import energyImg from '@/public/images/hero/hero-energy-process.jpg';
import cosmeticsImg from '@/public/images/industries/cosmetics-filling.jpg';
import roboticsImg from '@/public/images/industries/robotics-cell-square.jpg';

const industryCards: Array<{
  key: 'automotive' | 'foodBeverage' | 'energyProcess' | 'cosmeticsPackaging' | 'oemGeneral';
  href: string;
  image: StaticImageData;
  alt: string;
  position: string;
  layout: string;
  sizes: string;
}> = [
  {
    key: 'automotive',
    href: '/industries/automotive',
    image: autoImg,
    alt: 'Industrial robotic automotive body shop',
    position: '53% 50%',
    layout: 'md:col-span-2 lg:col-span-2 aspect-[21/9]',
    sizes: '(max-width: 1024px) 100vw, 66vw',
  },
  {
    key: 'foodBeverage',
    href: '/industries/food-beverage',
    image: foodBevImg,
    alt: 'Food and beverage production line',
    position: '48% 50%',
    layout: 'aspect-[4/5] lg:aspect-auto',
    sizes: '(max-width: 1024px) 100vw, 33vw',
  },
  {
    key: 'energyProcess',
    href: '/industries/energy-process',
    image: energyImg,
    alt: 'Energy and process industrial plant',
    position: '50% 55%',
    layout: 'aspect-[4/3]',
    sizes: '(max-width: 1024px) 100vw, 33vw',
  },
  {
    key: 'cosmeticsPackaging',
    href: '/industries/cosmetics-packaging',
    image: cosmeticsImg,
    alt: 'Cosmetics filling production line',
    position: '48% 52%',
    layout: 'aspect-[4/3]',
    sizes: '(max-width: 1024px) 100vw, 33vw',
  },
  {
    key: 'oemGeneral',
    href: '/industries/oem-general-industry',
    image: roboticsImg,
    alt: 'Industrial robotic cell',
    position: '50% 50%',
    layout: 'aspect-[4/3]',
    sizes: '(max-width: 1024px) 100vw, 33vw',
  },
];

export async function IndustryShowcase() {
  const t = await getTranslations('industries');

  return (
    <section id="industries" className="section-padding bg-ja-graphite">
      <div className="container-ja">
        <p className="eyebrow mb-4">{t('eyebrow')}</p>
        <h2 className="heading-2 text-white mb-10 max-w-3xl">{t('h2')}</h2>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {industryCards.map((card) => (
            <Link
              key={card.key}
              href={card.href}
              className={`group relative overflow-hidden rounded-[14px] ${card.layout}`}
            >
              <Image
                src={card.image}
                alt={card.alt}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-[1.025]"
                style={{ objectPosition: card.position }}
                sizes={card.sizes}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 z-10 p-6 lg:p-8">
                <h3 className="mb-2 text-xl font-semibold text-white lg:text-2xl">{t(card.key)}</h3>
                <p className="max-w-md text-sm text-white/70">{t(`${card.key}Desc`)}</p>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link href="/industries" className="text-cta text-white">
            {t('cta')} <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
