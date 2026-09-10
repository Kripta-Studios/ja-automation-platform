<script lang="ts">
  import { helpWorkflows } from '$lib/portal/help-workflows';
  import { base } from '$app/paths';

  type Locale = 'en' | 'es' | 'pt';
  type Manual = {
    id: string;
    title: Record<Locale, string>;
    description: Record<Locale, string>;
    audience: 'worker' | 'owner';
    locales: readonly Locale[];
    revision: string;
  };
  type HelpData = {
    locale: Locale;
    revision: string;
    user: { name: string; role: string | null; workforceProfile?: string };
    manuals: readonly Manual[];
  };

  let { data }: { data: HelpData } = $props();
  const localeNames: Record<Locale, string> = { en: 'EN', es: 'ES', pt: 'PT-BR' };
  const languageOptions: readonly Locale[] = ['en', 'es', 'pt'];

  const copy: Record<Locale, Record<string, string>> = {
    en: {
      title: 'Help and field guides',
      intro:
        'Use these guides for the work you do in the portal. They show the real screen names and explain what each status means.',
      revision: 'Revision',
      language: 'Guide language',
      download: 'Download PDF',
      availableLanguages: 'Available languages',
      quickStart: 'Quick start',
      detailed: 'Detailed reference',
      worker: 'Worker tasks',
      owner: 'Owner and Finance reference',
      privateNote:
        'Your My Pay view is private. An estimate or statement is not a payslip and does not prove that money was paid.',
      support:
        'For an invitation, access or password problem, contact admin@j-aautomation.com.',
      loginTitle: 'Use the invitation linked to your mailbox',
      loginBody:
        'If your invitation is linked to a company mailbox, open it from that mailbox and sign in with the account it names. If you were invited as an external worker, use the single-use invitation link to create your account. There is no public sign-up.',
      taskTime:
        'Record actual work and travel under the correct project. Customer minimums do not change actual hours.',
      taskExpense:
        'Upload a complete receipt, choose the real payer and keep the original until the upload is confirmed.',
      taskCorrection:
        'Read the reason for a returned item. Approved history needs the correction flow and a reason.',
      taskReport:
        'Use Daily for a factual field summary and Technical / PLC for technical work and validation. Never sign for the customer.',
      taskPay:
        'My Pay separates estimated, approved, scheduled and paid. Scheduled is an expected date, not proof of payment.',
      tasksHeading: 'A normal day at a glance',
      noGuides:
        'No guide is assigned to this account. Contact the verified support route in your invitation.',
      ownerRestricted: 'Available only to Owner and Finance roles.',
    },
    es: {
      title: 'Ayuda y guías de campo',
      intro:
        'Usa estas guías para el trabajo que haces en el portal. Incluyen los nombres reales de las pantallas y explican cada estado.',
      revision: 'Revisión',
      language: 'Idioma de la guía',
      download: 'Descargar PDF',
      availableLanguages: 'Idiomas disponibles',
      quickStart: 'Inicio rápido',
      detailed: 'Referencia detallada',
      worker: 'Tareas del trabajador',
      owner: 'Referencia de Owner y Finanzas',
      privateNote:
        'Tu vista My Pay es privada. Un estimado o estado no es una nómina ni demuestra que el dinero se haya pagado.',
      support:
        'Para problemas de invitación, acceso o contraseña, contacta con admin@j-aautomation.com.',
      loginTitle: 'Usa la invitación vinculada a tu buzón',
      loginBody:
        'Si tu invitación está vinculada a un buzón corporativo, ábrela desde ese buzón e inicia sesión con la cuenta indicada. Si eres un trabajador externo, usa el enlace de invitación de un solo uso para crear tu cuenta. No hay registro público.',
      taskTime:
        'Registra el trabajo y el viaje reales en el proyecto correcto. Los mínimos del cliente no cambian las horas reales.',
      taskExpense:
        'Sube un recibo completo, elige el pagador real y conserva el original hasta confirmar la carga.',
      taskCorrection:
        'Lee el motivo de un elemento devuelto. El historial aprobado requiere el flujo de corrección y un motivo.',
      taskReport:
        'Usa Daily para un resumen factual y Technical / PLC para trabajo y validación técnica. Nunca firmes por el cliente.',
      taskPay:
        'My Pay separa estimado, aprobado, programado y pagado. Programado es una fecha prevista, no una prueba de pago.',
      tasksHeading: 'Una jornada normal de un vistazo',
      noGuides:
        'No hay una guía asignada a esta cuenta. Contacta con el canal verificado de tu invitación.',
      ownerRestricted: 'Solo disponible para roles Owner y Finanzas.',
    },
    pt: {
      title: 'Ajuda e guias de campo',
      intro:
        'Use estes guias para o trabalho que você faz no portal. Eles mostram os nomes reais das telas e explicam cada status.',
      revision: 'Revisão',
      language: 'Idioma do guia',
      download: 'Baixar PDF',
      availableLanguages: 'Idiomas disponíveis',
      quickStart: 'Início rápido',
      detailed: 'Referência detalhada',
      worker: 'Tarefas do colaborador',
      owner: 'Referência de Owner e Finanças',
      privateNote:
        'Sua visão Meu pagamento é privada. Uma estimativa ou declaração não é um contracheque e não prova que o dinheiro foi pago.',
      support:
        'Para problemas de convite, acesso ou senha, contate admin@j-aautomation.com.',
      loginTitle: 'Use o convite vinculado à sua caixa de e-mail',
      loginBody:
        'Se o convite estiver vinculado a uma caixa corporativa, abra-o nessa caixa e entre com a conta indicada. Se você foi convidado como colaborador externo, use o link de uso único para criar sua conta. Não existe cadastro público.',
      taskTime:
        'Registre o trabalho e a viagem reais no projeto correto. Os mínimos do cliente não mudam as horas reais.',
      taskExpense:
        'Envie o comprovante completo, escolha o pagador real e guarde o original até confirmar o upload.',
      taskCorrection:
        'Leia o motivo de um item devolvido. O histórico aprovado exige o fluxo de correção e um motivo.',
      taskReport:
        'Use Daily para um resumo factual e Technical / PLC para trabalho e validação técnica. Nunca assine pelo cliente.',
      taskPay:
        'Meu pagamento separa estimado, aprovado, programado e pago. Programado é uma data esperada, não prova de pagamento.',
      tasksHeading: 'Um dia normal de relance',
      noGuides: 'Nenhum guia está atribuído a esta conta. Use o canal verificado no seu convite.',
      ownerRestricted: 'Disponível apenas para as funções Owner e Finanças.',
    },
  };

  const text = (key: string): string => copy[data.locale][key] ?? copy.en[key] ?? key;
  const downloadHref = (manual: Manual): string => {
    const requestedLocale = manual.locales.includes(data.locale)
      ? data.locale
      : (manual.locales[0] ?? 'en');
    return `${base}/app/help/${encodeURIComponent(manual.id)}/download?lang=${requestedLocale}`;
  };
  const title = (manual: Manual): string => manual.title[data.locale] ?? manual.title.en;
  const description = (manual: Manual): string =>
    manual.description[data.locale] ?? manual.description.en;
</script>

<svelte:head>
  <title>{text('title')} · J&A Automation</title>
  <meta name="description" content={text('intro')} />
</svelte:head>

<main class="help-page">
  <header class="help-header">
    <div>
      <p class="eyebrow">J&amp;A Automation · {data.user.name}</p>
      <h1>{text('title')}</h1>
      <p class="lead">{text('intro')}</p>
    </div>
    <div class="language-control">
      <span>{text('language')}</span>
      <div class="language-links" aria-label={text('language')}>
        {#each languageOptions as option}
          <a class:current={data.locale === option} href={`${base}/app/help?lang=${option}`}
            >{localeNames[option]}</a
          >
        {/each}
      </div>
    </div>
  </header>

  <section class="notice notice-login" aria-labelledby="login-title">
    <h2 id="login-title">{text('loginTitle')}</h2>
    <p>{text('loginBody')}</p>
  </section>

  {#if data.manuals.length === 0}
    <p class="empty" role="status">{text('noGuides')}</p>
  {:else}
    <section class="manual-grid" aria-label={text('availableLanguages')}>
      {#each data.manuals as manual}
        <article class="manual-card" data-manual-id={manual.id} data-audience={manual.audience}>
          <div class="card-heading">
            <div>
              <p class="card-kicker">
                {manual.audience === 'owner'
                  ? text('owner')
                  : manual.id === 'employee-field-guide'
                    ? text('quickStart')
                    : text('detailed')}
              </p>
              <h2>{title(manual)}</h2>
            </div>
            <span class="revision">{text('revision')} {manual.revision}</span>
          </div>
          <p>{description(manual)}</p>
          <div class="manual-actions">
            <a class="download" href={downloadHref(manual)} download>{text('download')}</a>
            <span class="available"
              >{text('availableLanguages')}: {manual.locales
                .map((item) => localeNames[item])
                .join(', ')}</span
            >
          </div>
          {#if manual.audience === 'owner'}<p class="restricted">{text('ownerRestricted')}</p>{/if}
        </article>
      {/each}
    </section>
  {/if}

  <section class="tasks" aria-labelledby="tasks-heading">
    <h2 id="tasks-heading">{text('tasksHeading')}</h2>
    <div class="task-grid">
      {#each helpWorkflows(data.user.role ?? 'worker', data.user.workforceProfile, data.locale) as topic}
        <article><h3><a href={`${base}/app/${topic.route}`}>{topic.title} →</a></h3><p>{topic.body}</p></article>
      {/each}
    </div>
  </section>

  <aside class="notice notice-private">
    {#if data.user.role === 'worker' && !data.user.workforceProfile}<p>{text('privateNote')}</p>{/if}
    <p>{text('support')}</p>
  </aside>
</main>

<style>
  :global(body) {
    background: #f4f7fa;
  }
  .help-page {
    max-width: 1120px;
    margin: 0 auto;
    padding: 2.5rem clamp(1rem, 4vw, 3rem) 4rem;
    color: #172033;
  }
  .help-header {
    display: flex;
    justify-content: space-between;
    gap: 2rem;
    align-items: end;
    margin-bottom: 1.5rem;
  }
  .eyebrow,
  .card-kicker {
    color: #0c6b8f;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin: 0 0 0.45rem;
  }
  h1 {
    color: #073b5c;
    font-size: clamp(1.8rem, 4vw, 2.6rem);
    line-height: 1.1;
    margin: 0 0 0.75rem;
  }
  h2 {
    color: #073b5c;
    font-size: 1.2rem;
    line-height: 1.25;
    margin: 0;
  }
  h3 {
    color: #073b5c;
    font-size: 1rem;
    margin: 0 0 0.35rem;
  }
  p {
    line-height: 1.55;
    margin: 0 0 0.75rem;
  }
  .lead {
    max-width: 720px;
    color: #475569;
    margin: 0;
  }
  .language-control {
    min-width: 145px;
  }
  .language-control > span {
    display: block;
    color: #475569;
    font-size: 0.8rem;
    font-weight: 700;
    margin-bottom: 0.35rem;
  }
  .language-links {
    display: flex;
    gap: 0.35rem;
  }
  .language-links a {
    color: #075985;
    border: 1px solid #b8c9d6;
    border-radius: 0.4rem;
    padding: 0.35rem 0.55rem;
    text-decoration: none;
    font-size: 0.8rem;
    font-weight: 700;
  }
  .language-links a.current {
    background: #075985;
    color: white;
    border-color: #075985;
  }
  .notice,
  .manual-card,
  .tasks {
    background: white;
    border: 1px solid #d7e1e8;
    border-radius: 0.75rem;
    box-shadow: 0 3px 14px rgba(23, 32, 51, 0.05);
  }
  .notice {
    padding: 1rem 1.25rem;
    margin-bottom: 1.25rem;
  }
  .notice h2 {
    margin-bottom: 0.45rem;
  }
  .notice-login {
    border-left: 4px solid #1597c5;
  }
  .manual-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 310px), 1fr));
    gap: 1rem;
  }
  .manual-card {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    min-height: 220px;
  }
  .card-heading {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: 0.75rem;
    margin-bottom: 0.7rem;
  }
  .revision {
    color: #64748b;
    font-size: 0.72rem;
    white-space: nowrap;
  }
  .manual-card > p {
    color: #475569;
  }
  .manual-actions {
    margin-top: auto;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .download {
    display: inline-flex;
    min-height: 2.5rem;
    align-items: center;
    border-radius: 0.45rem;
    background: #075985;
    color: white;
    padding: 0.55rem 0.8rem;
    text-decoration: none;
    font-weight: 700;
  }
  .download:focus-visible,
  .language-links a:focus-visible {
    outline: 3px solid #f59e0b;
    outline-offset: 2px;
  }
  .available,
  .restricted {
    color: #64748b;
    font-size: 0.78rem;
  }
  .restricted {
    margin: 0.8rem 0 0;
  }
  .tasks {
    margin-top: 1.25rem;
    padding: 1.25rem;
  }
  .tasks > h2 {
    margin-bottom: 1rem;
  }
  .task-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
    gap: 0.8rem;
  }
  .task-grid article {
    background: #f7fafc;
    border: 1px solid #e2e8f0;
    border-radius: 0.55rem;
    padding: 0.85rem;
  }
  .task-grid p {
    color: #475569;
    font-size: 0.9rem;
    margin: 0;
  }
  .notice-private {
    margin-top: 1.25rem;
    background: #eef8fc;
    border-color: #b8dcea;
  }
  .notice-private p:last-child {
    margin-bottom: 0;
  }
  .empty {
    background: white;
    border: 1px solid #d7e1e8;
    border-radius: 0.75rem;
    padding: 1rem 1.25rem;
  }
  @media (max-width: 680px) {
    .help-page {
      padding-top: 1.5rem;
    }
    .help-header {
      display: block;
    }
    .language-control {
      margin-top: 1rem;
    }
    .card-heading {
      display: block;
    }
    .revision {
      display: block;
      margin-top: 0.45rem;
    }
  }
</style>
