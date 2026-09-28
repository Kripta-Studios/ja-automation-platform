import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { localizedAlternates } from '@/lib/i18n/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const meta = await getTranslations({ locale, namespace: 'meta' });

  return {
    title: meta('contactTitle'),
    description: meta('contactDescription'),
    alternates: localizedAlternates(locale, '/contact'),
  };
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
