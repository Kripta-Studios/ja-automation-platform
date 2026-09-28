import { setRequestLocale } from 'next-intl/server';
import { localizedAlternates } from '@/lib/i18n/metadata';

type TermsCopy = {
  title: string;
  updated: string;
  sections: Array<{ heading: string; body: string }>;
};
const copy: Record<'en' | 'pt' | 'es', TermsCopy> = {
  en: {
    title: 'Terms of service',
    updated: 'Last updated: August 2026',
    sections: [
      {
        heading: '1. Acceptance of terms',
        body: 'By accessing and using the J&A Automation website, you agree to these terms.',
      },
      {
        heading: '2. Intellectual property',
        body: 'Content, graphics, diagrams, code and conceptual designs displayed on this website belong to J&A Automation LLC unless otherwise stated. Unauthorized reproduction or use is not permitted.',
      },
      {
        heading: '3. Engineering services disclaimer',
        body: 'Website information is general information and is not formal engineering advice. Industrial automation services require a formal signed contract and statement of work. J&A Automation is not liable for actions taken solely from website content.',
      },
      {
        heading: '4. Governing law',
        body: 'These terms are governed by the applicable laws stated in the signed agreement for a service engagement. Website content alone does not create a service contract.',
      },
    ],
  },
  pt: {
    title: 'Termos de serviço',
    updated: 'Última atualização: agosto de 2026',
    sections: [
      {
        heading: '1. Aceitação dos termos',
        body: 'Ao acessar e usar o site da J&A Automation, você concorda com estes termos.',
      },
      {
        heading: '2. Propriedade intelectual',
        body: 'Conteúdos, gráficos, diagramas, códigos e projetos conceituais exibidos neste site pertencem à J&A Automation LLC, salvo indicação contrária. A reprodução ou uso não autorizado não é permitido.',
      },
      {
        heading: '3. Aviso sobre serviços de engenharia',
        body: 'As informações do site são gerais e não constituem orientação formal de engenharia. Serviços de automação industrial exigem contrato formal assinado e escopo de trabalho. A J&A Automation não se responsabiliza por ações baseadas apenas no conteúdo do site.',
      },
      {
        heading: '4. Lei aplicável',
        body: 'Estes termos seguem as leis indicadas no contrato assinado para cada prestação de serviço. O conteúdo do site, por si só, não cria um contrato de serviço.',
      },
    ],
  },
  es: {
    title: 'Términos de servicio',
    updated: 'Última actualización: agosto de 2026',
    sections: [
      {
        heading: '1. Aceptación de los términos',
        body: 'Al acceder y utilizar el sitio de J&A Automation, acepta estos términos.',
      },
      {
        heading: '2. Propiedad intelectual',
        body: 'El contenido, los gráficos, diagramas, código y diseños conceptuales mostrados en este sitio pertenecen a J&A Automation LLC, salvo indicación contraria. No se permite la reproducción o uso no autorizado.',
      },
      {
        heading: '3. Aviso sobre servicios de ingeniería',
        body: 'La información del sitio es general y no constituye asesoramiento formal de ingeniería. Los servicios de automatización industrial requieren un contrato firmado y un alcance de trabajo. J&A Automation no responde por acciones basadas únicamente en el contenido del sitio.',
      },
      {
        heading: '4. Ley aplicable',
        body: 'Estos términos se rigen por las leyes indicadas en el contrato firmado para cada servicio. El contenido del sitio por sí solo no crea un contrato de servicio.',
      },
    ],
  },
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const language = locale.slice(0, 2) as 'en' | 'pt' | 'es';
  const selected = copy[language] ?? copy.en;
  return {
    title: `${selected.title} | J&A Automation`,
    description: selected.title,
    alternates: localizedAlternates(locale, '/terms'),
  };
}

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const selected = copy[locale.slice(0, 2) as 'en' | 'pt' | 'es'] ?? copy.en;
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
                <p>{section.body}</p>
              </section>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
