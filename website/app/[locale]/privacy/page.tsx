import { setRequestLocale } from 'next-intl/server';
import { contact } from '@/content/company';
import { localizedAlternates } from '@/lib/i18n/metadata';

type PrivacyCopy = {
  title: string;
  updated: string;
  sections: Array<{ heading: string; body: string }>;
};

const copy: Record<'en' | 'pt' | 'es', PrivacyCopy> = {
  en: {
    title: 'Privacy policy',
    updated: 'Last updated: August 2026',
    sections: [
      {
        heading: '1. Information we collect',
        body: 'When you visit the J&A Automation website, we may receive technical data such as your IP address, browser type and interaction metrics. When you submit a project inquiry, support request or career interest form, we collect the personal information you provide, such as your name, email address, phone number and company details.',
      },
      {
        heading: '2. How we use your information',
        body: 'We use submitted information to respond to inquiries, route technical support and communicate about relevant industrial automation services. We do not sell your personal data.',
      },
      {
        heading: '3. Data security',
        body: 'We apply reasonable technical and organizational measures to protect submitted information. No internet transmission is completely secure, so we cannot guarantee absolute security for data sent through the website.',
      },
      {
        heading: '4. Contact us',
        body: 'For questions about this policy, contact J&A Automation at',
      },
    ],
  },
  pt: {
    title: 'Política de privacidade',
    updated: 'Última atualização: agosto de 2026',
    sections: [
      {
        heading: '1. Informações coletadas',
        body: 'Ao visitar o site da J&A Automation, podemos receber dados técnicos como endereço IP, tipo de navegador e métricas de interação. Ao enviar uma consulta de projeto, solicitação de suporte ou interesse profissional, coletamos as informações fornecidas, como nome, e-mail, telefone e dados da empresa.',
      },
      {
        heading: '2. Uso das informações',
        body: 'Usamos as informações enviadas para responder consultas, encaminhar suporte técnico e comunicar sobre serviços relevantes de automação industrial. Não vendemos seus dados pessoais.',
      },
      {
        heading: '3. Segurança dos dados',
        body: 'Aplicamos medidas técnicas e organizacionais razoáveis para proteger as informações enviadas. Nenhuma transmissão pela internet é totalmente segura; por isso, não podemos garantir segurança absoluta para dados enviados pelo site.',
      },
      {
        heading: '4. Contato',
        body: 'Para dúvidas sobre esta política, entre em contato com a J&A Automation em',
      },
    ],
  },
  es: {
    title: 'Política de privacidad',
    updated: 'Última actualización: agosto de 2026',
    sections: [
      {
        heading: '1. Información que recopilamos',
        body: 'Al visitar el sitio de J&A Automation, podemos recibir datos técnicos como dirección IP, tipo de navegador y métricas de interacción. Cuando envía una consulta de proyecto, solicitud de soporte o interés profesional, recopilamos la información que proporciona, como nombre, correo electrónico, teléfono y datos de la empresa.',
      },
      {
        heading: '2. Cómo usamos la información',
        body: 'Usamos la información enviada para responder consultas, dirigir soporte técnico y comunicar servicios relevantes de automatización industrial. No vendemos sus datos personales.',
      },
      {
        heading: '3. Seguridad de los datos',
        body: 'Aplicamos medidas técnicas y organizativas razonables para proteger la información enviada. Ninguna transmisión por internet es completamente segura, por lo que no podemos garantizar seguridad absoluta para los datos enviados mediante el sitio.',
      },
      {
        heading: '4. Contacto',
        body: 'Para preguntas sobre esta política, contacte a J&A Automation en',
      },
    ],
  },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const selected =
    copy[
      (locale.slice(0, 2) as 'en' | 'pt' | 'es') in copy
        ? (locale.slice(0, 2) as 'en' | 'pt' | 'es')
        : 'en'
    ];
  return {
    title: `${selected.title} | J&A Automation`,
    description: selected.title,
    alternates: localizedAlternates(locale, '/privacy'),
  };
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const language = locale.slice(0, 2) as 'en' | 'pt' | 'es';
  const selected = copy[language] ?? copy.en;
  return (
    <div className="pt-20">
      <section className="section-padding bg-ja-surface min-h-[70vh]">
        <div className="container-ja max-w-3xl">
          <h1 className="heading-display text-4xl mb-6">{selected.title}</h1>
          <p className="text-sm text-ja-steel-500 mb-10">{selected.updated}</p>
          <div className="prose prose-ja max-w-none space-y-6 text-ja-steel-700">
            {selected.sections.map((section) => (
              <section key={section.heading}>
                <h2 className="text-xl font-semibold text-ja-ink mt-8 mb-4">{section.heading}</h2>
                <p>
                  {section.body}{' '}
                  {section.heading.startsWith('4.') && (
                    <a
                      className="text-ja-red underline decoration-current underline-offset-2 hover:text-ja-red-dark"
                      href={`mailto:${contact.email}`}
                    >
                      {contact.email}
                    </a>
                  )}
                </p>
              </section>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
