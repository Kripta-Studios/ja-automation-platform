'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { LocaleSwitcher } from '@/components/navigation/LocaleSwitcher';
import { ExternalLink, Mail, Phone } from 'lucide-react';
import { contact } from '@/content/company';
import { portalLoginUrl } from '@/lib/portal';

const navLinks = [
  { href: '/capabilities', key: 'capabilities' },
  { href: '/industries', key: 'industries' },
  { href: '/projects', key: 'projects' },
  { href: '/solutions/aquarex', key: 'aquarex' },
  { href: '/about', key: 'about' },
  { href: '/careers', key: 'careers' },
] as const;

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileMenu({ isOpen, onClose }: MobileMenuProps) {
  const t = useTranslations('nav');

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sheet */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-sm bg-white z-50 lg:hidden
          transform transition-transform duration-300 ease-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        <div className="flex flex-col h-full pt-20 pb-8 px-6 overflow-y-auto">
          {/* Navigation Links */}
          <nav className="flex flex-col gap-1 mb-8">
            {navLinks.map((link) => (
              <Link
                key={link.key}
                href={link.href}
                className="py-3 px-4 text-lg font-medium text-ja-ink hover:bg-ja-surface rounded-lg transition-colors"
                onClick={onClose}
              >
                {t(link.key)}
              </Link>
            ))}
          </nav>

          {/* CTAs */}
          <div className="flex flex-col gap-3 mb-8">
            <Link
              href="/contact?intent=project"
              className="btn btn-primary text-center"
              onClick={onClose}
            >
              {t('talkToEngineer')}
            </Link>
            <Link
              href="/contact?intent=support"
              className="btn btn-secondary text-center"
              onClick={onClose}
            >
              {t('requestSupport')}
            </Link>
            <a
              href={portalLoginUrl}
              className="py-3 px-4 text-center text-sm font-medium text-ja-charcoal border border-ja-line rounded-lg hover:bg-ja-surface transition-colors"
              onClick={onClose}
            >
              {t('portalLogin')}
            </a>
          </div>

          {/* Locale */}
          <div className="mb-8">
            <LocaleSwitcher variant="dark" />
          </div>

          {/* Contact Info */}
          <div className="mt-auto space-y-3 pt-6 border-t border-ja-line">
            <a
              href={`tel:${contact.usPhone.replace(/[^\d+]/g, '')}`}
              className="flex items-center gap-3 text-sm text-ja-steel-700 hover:text-ja-red transition-colors"
            >
              <Phone size={16} />
              {contact.usPhone}
            </a>
            <a
              href={`mailto:${contact.email}`}
              className="flex items-center gap-3 text-sm text-ja-steel-700 hover:text-ja-red transition-colors"
            >
              <Mail size={16} />
              {contact.email}
            </a>
            <a
              href={contact.linkedinUrl}
              className="flex items-center gap-3 text-sm text-ja-steel-700 hover:text-ja-red transition-colors"
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={16} />
              {contact.primaryName}
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
