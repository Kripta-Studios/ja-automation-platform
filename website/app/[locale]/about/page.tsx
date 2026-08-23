import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n/navigation';
import Image from 'next/image';
import assemblyImg from '@/public/images/capabilities/assembly-engines.jpg';
import { company } from '@/content/company';

export async function generateMetadata() {
  return {
    title: 'About | J&A Automation',
    description: 'J&A Automation is an industrial automation firm founded in 2007.',
  };
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const nav = await getTranslations('nav');
  const intro = await getTranslations('intro');

  return (
    <div className="pt-20">
      {/* ═══ HEADER ═══ */}
      <section className="section-padding bg-ja-surface">
        <div className="container-ja">
          <p className="eyebrow mb-4">{nav('about')}</p>
          <div className="lines-motif mb-6" aria-hidden="true" />
          <h1 className="heading-display mb-6 max-w-4xl">{intro('h2')}</h1>
          <p className="text-lead text-ja-steel-700 max-w-2xl mb-12">{intro('p1')}</p>

          <div className="relative rounded-[14px] overflow-hidden aspect-[21/9]">
            <Image
              src={assemblyImg}
              alt="J-Aautomation Facility and Assembly Operations"
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
              <h2 className="heading-2 mb-6">Our Story</h2>
              <p className="text-body text-ja-steel-700 mb-6 leading-relaxed">
                Founded in 2007 in Brazil, J&A Automation began as a specialized integrator for the
                food and beverage industry, quickly expanding its capabilities into complex
                automotive assembly and process control.
              </p>
              <p className="text-body text-ja-steel-700 mb-6 leading-relaxed">
                By 2011, we expanded operations to the USA, establishing a dual-presence model that
                allows us to support multinational OEMs across the Americas. Today, we deliver
                turn-key PLC programming, robotics integration, and electrical design for the most
                demanding industrial environments.
              </p>
              <p className="text-body text-ja-steel-700 leading-relaxed">
                Our philosophy is simple: engineering excellence drives reliability. We build code
                structures that are modular, robust, and designed for the real-world conditions of
                the factory floor.
              </p>
            </div>

            <div className="bg-ja-graphite rounded-xl p-8 lg:p-12 text-white flex flex-col justify-center">
              <div className="space-y-8">
                <div>
                  <p className="text-4xl font-bold text-ja-red mb-2">{company.founded}</p>
                  <p className="text-sm text-ja-steel-300 uppercase tracking-wider">Founded</p>
                </div>
                <div>
                  <p className="text-4xl font-bold text-ja-red mb-2">{company.officeCount}</p>
                  <p className="text-sm text-ja-steel-300 uppercase tracking-wider">
                    Offices (USA & Brazil)
                  </p>
                </div>
                <div>
                  <p className="text-4xl font-bold text-ja-red mb-2">1,000+</p>
                  <p className="text-sm text-ja-steel-300 uppercase tracking-wider">
                    Projects Completed
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
          <h2 className="heading-2 text-center mb-16">The J&A Standard</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="card">
              <h3 className="text-lg font-semibold mb-3">Modular Engineering</h3>
              <p className="text-sm text-ja-steel-700 leading-relaxed">
                We develop PLC and HMI codebases using object-oriented principles. Standardized
                Add-On Instructions (AOIs) ensure consistency, reduce debugging time, and make our
                systems scalable.
              </p>
            </div>
            <div className="card">
              <h3 className="text-lg font-semibold mb-3">OEM Independent</h3>
              <p className="text-sm text-ja-steel-700 leading-relaxed">
                While we have deep expertise in Rockwell, Siemens, and KUKA, we remain
                hardware-agnostic. We architect the best solution for your specific technical
                requirements and budget.
              </p>
            </div>
            <div className="card">
              <h3 className="text-lg font-semibold mb-3">Lifecycle Support</h3>
              <p className="text-sm text-ja-steel-700 leading-relaxed">
                Commissioning isn&apos;t the end. We provide comprehensive documentation, operator
                training, and secure remote support infrastructure to ensure your line runs at peak
                OEE for decades.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ TEAM CTA ═══ */}
      <section className="section-padding bg-white">
        <div className="container-ja text-center">
          <h2 className="heading-2 mb-6">Join Our Team</h2>
          <p className="text-lead text-ja-steel-700 max-w-2xl mx-auto mb-10">
            We are always looking for talented PLC engineers, robotics specialists, and electrical
            designers to join our growing operations in the USA and Brazil.
          </p>
          <Link href="/careers" className="btn btn-secondary-dark">
            View Career Opportunities
          </Link>
        </div>
      </section>
    </div>
  );
}
