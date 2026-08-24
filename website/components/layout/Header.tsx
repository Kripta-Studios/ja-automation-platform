'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import logoImg from '@/public/brand/logo-jaautomation.webp';
import { Link, usePathname } from '@/lib/i18n/navigation';
import Image from 'next/image';
import { Menu, X } from 'lucide-react';
import { LocaleSwitcher } from '@/components/navigation/LocaleSwitcher';
import { MobileMenu } from '@/components/navigation/MobileMenu';
import { portalLoginUrl } from '@/lib/portal';

const navLinks = [
  { href: '/capabilities', key: 'capabilities' },
  { href: '/industries', key: 'industries' },
  { href: '/projects', key: 'projects' },
  { href: '/solutions/aquarex', key: 'aquarex' },
  { href: '/about', key: 'about' },
  { href: '/careers', key: 'careers' },
] as const;

function MobileNavigation({
  textColor,
  openLabel,
  closeLabel,
}: {
  textColor: string;
  openLabel: string;
  closeLabel: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') setMobileOpen(false);
  }, []);

  useEffect(() => {
    if (mobileOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [mobileOpen, handleEscape]);

  return (
    <>
      <button
        className={`lg:hidden relative z-10 p-2 -mr-2 ${textColor}`}
        onClick={() => setMobileOpen((open) => !open)}
        aria-expanded={mobileOpen}
        aria-label={mobileOpen ? closeLabel : openLabel}
      >
        {mobileOpen ? <X size={24} /> : <Menu size={24} />}
      </button>
      <MobileMenu isOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
    </>
  );
}

export function Header() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  const isHome = pathname === '/' || pathname === '';

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 56);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const headerBg =
    scrolled || !isHome
      ? 'bg-white/[0.96] backdrop-blur-sm border-b border-ja-line shadow-[0_1px_3px_rgba(0,0,0,0.04)]'
      : 'bg-transparent border-b border-transparent';

  const textColor = scrolled || !isHome ? 'text-ja-ink' : 'text-white';

  const logoFilter = scrolled || !isHome ? '' : 'brightness-0 invert';

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${headerBg}`}
      role="banner"
    >
      <div className="container-ja">
        <div
          className={`flex items-center justify-between ${scrolled || !isHome ? 'h-16' : 'h-20'} transition-all duration-300`}
        >
          {/* Logo */}
          <Link href="/" className="relative z-10 flex-shrink-0" aria-label={t('siteHome')}>
            <Image
              src={logoImg}
              alt={t('logoAlt')}
              width={160}
              height={40}
              className={`h-8 w-auto md:h-10 transition-all duration-300 ${logoFilter} hover:scale-105`}
              priority
            />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1" aria-label={t('mainNavigation')}>
            {navLinks.map((link) => (
              <Link
                key={link.key}
                href={link.href}
                className={`px-3 py-2 text-sm font-medium transition-colors duration-200 rounded-md
                  ${textColor}
                  ${pathname.startsWith(link.href) ? 'opacity-100' : 'opacity-80 hover:opacity-100'}
                `}
              >
                {t(link.key)}
              </Link>
            ))}

            <div className="ml-2">
              <LocaleSwitcher variant={scrolled || !isHome ? 'dark' : 'light'} />
            </div>

            <a
              href={portalLoginUrl}
              className="btn btn-portal-login ml-2 !min-h-[40px] !px-4 text-sm font-medium"
              aria-label={t('portalLogin')}
            >
              {t('portalLogin')}
            </a>

            <Link
              href="/contact?intent=project"
              className="btn btn-primary ml-3 text-sm !min-h-[40px] !px-5"
            >
              {t('talkToEngineer')}
            </Link>
          </nav>

          {/* Mobile Menu Button */}
          <MobileNavigation
            key={pathname}
            textColor={textColor}
            openLabel={t('openMenu')}
            closeLabel={t('closeMenu')}
          />
        </div>
      </div>
    </header>
  );
}
