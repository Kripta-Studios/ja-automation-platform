import Image from 'next/image';
import { getTranslations } from 'next-intl/server';

const clientLogos = [
  { name: 'BMW', file: 'bmw.png' },
  { name: 'Ford', file: 'ford.png' },
  { name: 'Mercedes-Benz', file: 'mercedes-benz.png' },
  { name: 'Coca-Cola', file: 'coca-cola.png' },
  { name: 'Heineken', file: 'heineken.png' },
  { name: 'Avon', file: 'avon.png' },
  { name: 'Petrobras', file: 'petrobras.png' },
  { name: 'Campari', file: 'campari.png' },
  { name: 'Unilever', file: 'unilever.png' },
  { name: 'Ambev', file: 'ambev.png' },
  { name: 'SC Johnson', file: 'sc-johnson.png' },
  { name: 'Grupo Boticário', file: 'grupo-boticario.png' },
] as const;

const publicBasePath = process.env.JA_PUBLIC_BASE_PATH ?? '/j-aautomation';

export async function ClientExperience() {
  const t = await getTranslations('clients');

  return (
    <section id="clients" className="border-y border-ja-line bg-ja-surface py-16 lg:py-20">
      <div className="container-ja">
        <div className="mb-10 max-w-3xl">
          <p className="eyebrow mb-4">Selected experience</p>
          <h2 className="heading-2">{t('h2')}</h2>
        </div>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-ja-line bg-ja-line p-px sm:grid-cols-3 lg:grid-cols-4">
          {clientLogos.map((client) => (
            <div
              key={client.name}
              className="flex h-36 items-center justify-center bg-white p-5 sm:h-40 sm:p-7"
            >
              <Image
                src={`${publicBasePath}/brand/clients/${client.file}`}
                alt={`${client.name} logo`}
                unoptimized
                loading="eager"
                width={960}
                height={960}
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
