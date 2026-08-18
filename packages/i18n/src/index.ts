export const locales = ['en', 'pt', 'es'] as const;
export type Locale = (typeof locales)[number];
export const localeTags: Record<Locale, string> = { en: 'en', pt: 'pt-BR', es: 'es' };
export const isLocale = (value: string): value is Locale => locales.includes(value as Locale);
