import { getTranslations } from 'next-intl/server';
import { Link } from '@/lib/i18n/navigation';
import Image from 'next/image';
import { contact } from '@/content/company';
import logoImg from '@/public/brand/logo-jaautomation.png';
import { portalLoginUrl } from '@/lib/portal';

export async function Footer() {
  const t = await getTranslations('footer');
  const nav = await getTranslations('nav');
  const industries = await getTranslations('industries');

  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-ja-graphite text-white" role="contentinfo">
      <div className="container-ja py-16 lg:py-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-8">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" aria-label="J-Aautomation Home" className="inline-block">
              <Image
                src={logoImg}
                alt="J-Aautomation"
                width={160}
                height={48}
                className="h-10 w-auto object-contain brightness-0 invert opacity-90 transition-opacity hover:opacity-100"
              />
            </Link>
            <p className="text-sm text-ja-steel-300 leading-relaxed max-w-xs">{t('descriptor')}</p>
          </div>

          {/* Capabilities */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white mb-4">
              {t('capabilitiesHeading')}
            </h3>
            <ul className="space-y-2.5">
              <li>
                <Link
                  href="/capabilities/plc-hmi-scada"
                  className="text-sm text-ja-steel-300 hover:text-white transition-colors"
                >
                  {t('plcHmiScada')}
                </Link>
              </li>
              <li>
                <Link
                  href="/capabilities/robotics-integration"
                  className="text-sm text-ja-steel-300 hover:text-white transition-colors"
                >
                  {t('robotics')}
                </Link>
              </li>
              <li>
                <Link
                  href="/capabilities/electrical-controls"
                  className="text-sm text-ja-steel-300 hover:text-white transition-colors"
                >
                  {t('electricalControls')}
                </Link>
              </li>
              <li>
                <Link
                  href="/capabilities/simulation-offline-engineering"
                  className="text-sm text-ja-steel-300 hover:text-white transition-colors"
                >
                  {t('simulation')}
                </Link>
              </li>
              <li>
                <Link
                  href="/capabilities/motion-process-control"
                  className="text-sm text-ja-steel-300 hover:text-white transition-colors"
                >
                  {t('motionProcess')}
                </Link>
              </li>
              <li>
                <Link
                  href="/capabilities/commissioning-support"
                  className="text-sm text-ja-steel-300 hover:text-white transition-colors"
                >
                  {t('commissioningSupport')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Industries */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white mb-4">
              {t('industriesHeading')}
            </h3>
            <ul className="space-y-2.5">
              <li>
                <Link
                  href="/industries/automotive"
                  className="text-sm text-ja-steel-300 hover:text-white transition-colors"
                >
                  {industries('automotive')}
                </Link>
              </li>
              <li>
                <Link
                  href="/industries/food-beverage"
                  className="text-sm text-ja-steel-300 hover:text-white transition-colors"
                >
                  {industries('foodBeverage')}
                </Link>
              </li>
              <li>
                <Link
                  href="/industries/energy-process"
                  className="text-sm text-ja-steel-300 hover:text-white transition-colors"
                >
                  {industries('energyProcess')}
                </Link>
              </li>
              <li>
                <Link
                  href="/industries/cosmetics-packaging"
                  className="text-sm text-ja-steel-300 hover:text-white transition-colors"
                >
                  {industries('cosmeticsPackaging')}
                </Link>
              </li>
              <li>
                <Link
                  href="/industries/oem-general-industry"
                  className="text-sm text-ja-steel-300 hover:text-white transition-colors"
                >
                  {industries('oemGeneral')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white mb-4">
              {t('companyHeading')}
            </h3>
            <ul className="space-y-2.5">
              <li>
                <Link
                  href="/projects"
                  className="text-sm text-ja-steel-300 hover:text-white transition-colors"
                >
                  {nav('projects')}
                </Link>
              </li>
              <li>
                <Link
                  href="/solutions/aquarex"
                  className="text-sm text-ja-steel-300 hover:text-white transition-colors"
                >
                  {nav('aquarex')}
                </Link>
              </li>
              <li>
                <Link
                  href="/about"
                  className="text-sm text-ja-steel-300 hover:text-white transition-colors"
                >
                  {nav('about')}
                </Link>
              </li>
              <li>
                <Link
                  href="/careers"
                  className="text-sm text-ja-steel-300 hover:text-white transition-colors"
                >
                  {nav('careers')}
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="text-sm text-ja-steel-300 hover:text-white transition-colors"
                >
                  {nav('contact')}
                </Link>
              </li>
              <li>
                <a
                  href={portalLoginUrl}
                  className="text-sm text-ja-steel-300 hover:text-white transition-colors"
                >
                  {nav('portalLogin')}
                </a>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white mb-4">
              {t('contactHeading')}
            </h3>
            <ul className="space-y-2.5">
              <li>
                <a
                  href={`tel:${contact.usPhone.replace(/[^\d+]/g, '')}`}
                  className="text-sm text-ja-steel-300 hover:text-white transition-colors"
                >
                  {contact.usPhone}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${contact.email}`}
                  className="text-sm text-ja-steel-300 hover:text-white transition-colors"
                >
                  {contact.email}
                </a>
              </li>
              <li>
                <a
                  href={contact.linkedinUrl}
                  className="text-sm text-ja-steel-300 hover:text-white transition-colors"
                  target="_blank"
                  rel="noreferrer"
                >
                  {contact.primaryName}
                </a>
              </li>
              <li className="pt-1">
                <span className="text-xs text-ja-steel-500">{t('operations')}</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Row */}
        <div className="mt-14 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-ja-steel-500">{t('copyright', { year: currentYear })}</p>
          <div className="flex items-center gap-6">
            <Link
              href="/privacy"
              className="text-xs text-ja-steel-500 hover:text-white transition-colors"
            >
              {t('privacy')}
            </Link>
            <Link
              href="/terms"
              className="text-xs text-ja-steel-500 hover:text-white transition-colors"
            >
              {t('terms')}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
