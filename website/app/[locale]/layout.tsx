import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Manrope, IBM_Plex_Mono } from 'next/font/google';
import { routing } from '@/lib/i18n/routing';
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

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const messages = (await import(`@/content/locales/${locale}.json`)).default;

  return {
    title: messages.meta.homeTitle,
    description: messages.meta.homeDescription,
    metadataBase: new URL('https://www.j-aautomation.com'),
    alternates: {
      canonical: `/${locale}`,
      languages: {
        en: '/en',
        'pt-BR': '/pt',
        es: '/es',
        'x-default': '/en',
      },
    },
    openGraph: {
      type: 'website',
      siteName: 'J&A Automation',
      locale: locale === 'pt' ? 'pt_BR' : locale === 'es' ? 'es_MX' : 'en_US',
    },
    icons: {
      icon: [{ url: '/j-aautomation/brand/favicon.png', sizes: '32x32', type: 'image/png' }],
      apple: '/j-aautomation/brand/favicon.png',
    },
    other: {
      'darkreader-lock': 'enabled',
    },
  };
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
