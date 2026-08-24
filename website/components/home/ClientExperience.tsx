import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import ambevLogo from '@/public/brand/clients/ambev.webp';
import avonLogo from '@/public/brand/clients/avon.webp';
import bmwLogo from '@/public/brand/clients/bmw.webp';
import campariLogo from '@/public/brand/clients/campari.webp';
import cocaColaLogo from '@/public/brand/clients/coca-cola.webp';
import fordLogo from '@/public/brand/clients/ford.webp';
import grupoBoticarioLogo from '@/public/brand/clients/grupo-boticario.webp';
import heinekenLogo from '@/public/brand/clients/heineken.webp';
import mercedesBenzLogo from '@/public/brand/clients/mercedes-benz.webp';
import petrobrasLogo from '@/public/brand/clients/petrobras.webp';
import scJohnsonLogo from '@/public/brand/clients/sc-johnson.webp';
import unileverLogo from '@/public/brand/clients/unilever.webp';

const clientLogos = [
  { name: 'BMW', src: bmwLogo },
  { name: 'Ford', src: fordLogo },
  { name: 'Mercedes-Benz', src: mercedesBenzLogo },
  { name: 'Coca-Cola', src: cocaColaLogo },
  { name: 'Heineken', src: heinekenLogo },
  { name: 'Avon', src: avonLogo },
  { name: 'Petrobras', src: petrobrasLogo },
  { name: 'Campari', src: campariLogo },
  { name: 'Unilever', src: unileverLogo },
  { name: 'Ambev', src: ambevLogo },
  { name: 'SC Johnson', src: scJohnsonLogo },
  { name: 'Grupo Boticário', src: grupoBoticarioLogo },
] as const;

export async function ClientExperience() {
  const t = await getTranslations('clients');

  return (
    <section id="clients" className="border-y border-ja-line bg-ja-surface py-16 lg:py-20">
      <div className="container-ja">
        <div className="mb-10 max-w-3xl">
          <p className="eyebrow mb-4">{t('eyebrow')}</p>
          <h2 className="heading-2">{t('h2')}</h2>
        </div>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-ja-line bg-ja-line p-px sm:grid-cols-3 lg:grid-cols-4">
          {clientLogos.map((client) => (
            <div
              key={client.name}
              className="flex h-36 items-center justify-center bg-white p-5 sm:h-40 sm:p-7"
            >
              <Image
                src={client.src}
                alt={t('logoAlt', { name: client.name })}
                loading="lazy"
                className="h-auto max-h-20 w-auto max-w-[78%] object-contain sm:max-h-24"
                sizes="(max-width: 640px) 39vw, (max-width: 1024px) 26vw, 20vw"
              />
            </div>
          ))}
        </div>

        <p className="mt-8 max-w-2xl text-xs text-ja-steel-500">{t('disclaimer')}</p>
      </div>
    </section>
  );
}
