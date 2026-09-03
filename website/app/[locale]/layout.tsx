import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Manrope, IBM_Plex_Mono } from 'next/font/google';
import { routing, type Locale } from '@/lib/i18n/routing';
import { localizedAlternates } from '@/lib/i18n/metadata';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import '@/app/globals.css';

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});

const publicBasePath = (process.env.JA_PUBLIC_BASE_PATH ?? '/j-aautomation').replace(/\/+$/, '');
const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://j-aautomation.com';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const selectedLocale = routing.locales.includes(locale as (typeof routing.locales)[number])
    ? (locale as Locale)
    : routing.defaultLocale;
  const messages = (await import(`@/content/locales/${selectedLocale}.json`)).default;
  const localizedPath = `${publicBasePath}/${selectedLocale}`;

  return {
    title: messages.meta.homeTitle,
    description: messages.meta.homeDescription,
    metadataBase: new URL(siteOrigin),
    alternates: localizedAlternates(selectedLocale),
    openGraph: {
      type: 'website',
      siteName: messages.meta.siteName,
      url: localizedPath,
      locale: selectedLocale === 'pt' ? 'pt_BR' : selectedLocale === 'es' ? 'es_MX' : 'en_US',
    },
    icons: {
      icon: [{ url: `${publicBasePath}/brand/favicon.png`, sizes: '32x32', type: 'image/png' }],
      apple: `${publicBasePath}/brand/favicon.png`,
    },
    other: {
      'darkreader-lock': 'enabled',
    },
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as 'en' | 'pt' | 'es')) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html
      lang={locale === 'pt' ? 'pt-BR' : locale}
      className={`${manrope.variable} ${ibmPlexMono.variable}`}
      suppressHydrationWarning
    >
      <body className="font-[family-name:var(--font-manrope)]">
        <NextIntlClientProvider messages={messages}>
          <a href="#main-content" className="skip-link">
            {(messages as Record<string, Record<string, string>>).nav?.skipToContent ??
              'Skip to main content'}
          </a>
          <Header />
          <main id="main-content">{children}</main>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
