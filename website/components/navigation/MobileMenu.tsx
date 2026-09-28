'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { LocaleSwitcher } from '@/components/navigation/LocaleSwitcher';
import { ExternalLink, Mail, X } from 'lucide-react';
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
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = sheet.current;
    const controls = () =>
      Array.from(panel?.querySelectorAll<HTMLElement>('a[href], button, select') ?? []).filter(
        (element) => element.getClientRects().length > 0,
      );
    controls()[0]?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = controls();
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    panel?.addEventListener('keydown', trapFocus);
    return () => {
      panel?.removeEventListener('keydown', trapFocus);
      previous?.focus();
    };
  }, [isOpen]);

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
        ref={sheet}
        inert={!isOpen}
        aria-hidden={!isOpen}
        role="dialog"
        aria-modal="true"
        aria-label={t('navigationMenu')}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t('closeMenu')}
          className="absolute right-5 top-4 flex h-11 w-11 items-center justify-center rounded-full border border-ja-line text-ja-ink hover:bg-ja-surface"
        >
          <X size={22} aria-hidden="true" />
        </button>
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
