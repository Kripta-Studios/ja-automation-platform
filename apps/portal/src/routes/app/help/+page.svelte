<script lang="ts">
  import { onDestroy } from 'svelte';
  import { helpWorkflows } from '$lib/portal/help-workflows';
  import {
    fetchManualWithRetry,
    manualDownloadFilename,
    type ManualDownloadFailure,
  } from '$lib/portal/ui/manual-download';
  import { base } from '$app/paths';

  type Locale = 'en' | 'es' | 'pt';
  type Persona =
    | 'worker'
    | 'manager'
    | 'finance'
    | 'owner'
    | 'auditor'
    | 'supplier-coordinator'
    | 'external-technician';
  type Manual = {
    id: string;
    title: Record<Locale, string>;
    description: Record<Locale, string>;
    audience: string;
    allowedPersonas: readonly Persona[];
    locales: readonly Locale[];
    revision: string;
  };
  type HelpData = {
    locale: Locale;
    revision: string;
    user: { name: string; role: string | null; persona: Persona | null; workforceProfile?: string };
    manuals: readonly Manual[];
  };

  let { data }: { data: HelpData } = $props();
  let busyManualId = $state<string | null>(null);
  let downloadFailure = $state<{ id: string; reason: ManualDownloadFailure } | null>(null);
  let activeDownload: AbortController | null = null;
  let destroyed = false;
  onDestroy(() => {
    destroyed = true;
    activeDownload?.abort();
  });
  const localeNames: Record<Locale, string> = { en: 'EN', es: 'ES', pt: 'PT-BR' };
  const languageOptions: readonly Locale[] = ['en', 'es', 'pt'];

  const roleNames: Record<Persona, Record<Locale, string>> = {
    worker: { en: 'Worker', es: 'Trabajador', pt: 'Colaborador' },
    manager: { en: 'Project manager', es: 'Gestor de proyectos', pt: 'Gerente de projetos' },
    finance: {
      en: 'Finance administrator',
      es: 'Administrador financiero',
      pt: 'Administrador financeiro',
    },
    owner: {
      en: 'Owner administrator',
      es: 'Administrador propietario',
      pt: 'Administrador proprietário',
    },
    auditor: {
      en: 'Read-only auditor',
      es: 'Auditor de solo lectura',
      pt: 'Auditor somente leitura',
    },
    'supplier-coordinator': {
      en: 'Supplier coordinator',
      es: 'Coordinador de proveedores',
      pt: 'Coordenador de fornecedores',
    },
    'external-technician': {
      en: 'External technician',
      es: 'Técnico externo',
      pt: 'Técnico externo',
    },
  };
  const readingPaths: Record<Persona, Record<Locale, string>> = {
    worker: {
      en: 'Start with your assigned work, then time, expenses, reports and My Pay.',
      es: 'Empieza por tu trabajo asignado; sigue con horas, gastos, informes y Mi pago.',
      pt: 'Comece pelo trabalho atribuído; siga com horas, despesas, relatórios e Meu pagamento.',
    },
    manager: {
      en: 'Start with assigned projects, then planning and operational review.',
      es: 'Empieza por los proyectos asignados; sigue con planificación y revisión operativa.',
      pt: 'Comece pelos projetos atribuídos; siga com planejamento e revisão operacional.',
    },
    finance: {
      en: 'Start with commercial configuration, then billing, settlements and records.',
      es: 'Empieza por la configuración comercial; sigue con facturación, liquidaciones y registros.',
      pt: 'Comece pela configuração comercial; siga com faturamento, liquidações e registros.',
    },
    owner: {
      en: 'Start with administration and access, then planning, approvals and oversight.',
      es: 'Empieza por administración y acceso; sigue con planificación, aprobaciones y supervisión.',
      pt: 'Comece por administração e acesso; siga com planejamento, aprovações e supervisão.',
    },
    auditor: {
      en: 'Start with read-only evidence, then finance and audit review.',
      es: 'Empieza por las evidencias de solo lectura; sigue con finanzas y revisión de auditoría.',
      pt: 'Comece pelas evidências somente leitura; siga com finanças e revisão de auditoria.',
    },
    'supplier-coordinator': {
      en: 'Start with authorized installations, then technicians and team hours.',
      es: 'Empieza por las instalaciones autorizadas; sigue con técnicos y horas del equipo.',
      pt: 'Comece pelas instalações autorizadas; siga com técnicos e horas da equipe.',
    },
    'external-technician': {
      en: 'Start with your authorized assignments, then your own time and reports.',
      es: 'Empieza por tus tareas autorizadas; sigue con tus horas e informes.',
      pt: 'Comece pelas suas tarefas autorizadas; siga com suas horas e relatórios.',
    },
  };

  const copy: Record<Locale, Record<string, string>> = {
    en: {
      title: 'Help and field guides',
      intro:
        'Use these guides for the work you do in the portal. They show the real screen names and explain what each status means.',
      revision: 'Revision',
      language: 'Guide language',
      download: 'Download PDF',
      downloading: 'Preparing PDF…',
      retryDownload: 'Try download again',
      signInAgain: 'Your session ended. Sign in again to download this guide.',
      signInAction: 'Sign in',
      accessHelp:
        'This guide is unavailable for your account. Ask an administrator to confirm your access.',
      temporaryHelp: 'The PDF is still unavailable after retrying. Try again or contact support.',
      laterHelp: 'The server asked us to wait. Please try again later or contact support.',
      contactSupport: 'Contact support',
      availableLanguages: 'Available languages',
      quickStart: 'Quick start',
      detailed: 'Detailed reference',
      sharedChapters:
        'This guide contains shared chapters. Read the sections for your role and its allowed tasks.',
      rolePaths: 'I am this role: where do I start?',
      worker: 'Worker tasks',
      owner: 'Role reference',
      privateNote:
        'Your My Pay view is private. An estimate or statement is not a payslip and does not prove that money was paid.',
      support: 'For an invitation, access or password problem, contact admin@j-aautomation.com.',
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
    },
    es: {
      title: 'Ayuda y guías de campo',
      intro:
        'Usa estas guías para el trabajo que haces en el portal. Incluyen los nombres reales de las pantallas y explican cada estado.',
      revision: 'Revisión',
      language: 'Idioma de la guía',
      download: 'Descargar PDF',
      downloading: 'Preparando PDF…',
      retryDownload: 'Reintentar descarga',
      signInAgain: 'Tu sesión terminó. Inicia sesión de nuevo para descargar la guía.',
      signInAction: 'Iniciar sesión',
      accessHelp:
        'Esta guía no está disponible para tu cuenta. Solicita al administrador que compruebe tu acceso.',
      temporaryHelp:
        'El PDF sigue sin estar disponible tras reintentar. Inténtalo de nuevo o contacta con soporte.',
      laterHelp: 'El servidor pidió esperar. Vuelve a intentarlo más tarde o contacta con soporte.',
      contactSupport: 'Contactar con soporte',
      availableLanguages: 'Idiomas disponibles',
      quickStart: 'Inicio rápido',
      detailed: 'Referencia detallada',
      sharedChapters:
        'Esta guía contiene capítulos compartidos. Lee las secciones de tu perfil y sus tareas permitidas.',
      rolePaths: 'Soy este perfil: ¿por dónde empiezo?',
      worker: 'Tareas del trabajador',
      owner: 'Referencia por perfil',
      privateNote:
        'Tu vista Mi pago es privada. Un estimado o estado no es una nómina ni demuestra que el dinero se haya pagado.',
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
        'Usa el informe diario para un resumen factual y el informe técnico / PLC para trabajo y validación técnica. Nunca firmes por el cliente.',
      taskPay:
        'Mi pago separa estimado, aprobado, programado y pagado. Programado es una fecha prevista, no una prueba de pago.',
      tasksHeading: 'Una jornada normal de un vistazo',
      noGuides:
        'No hay una guía asignada a esta cuenta. Contacta con el canal verificado de tu invitación.',
    },
    pt: {
      title: 'Ajuda e guias de campo',
      intro:
        'Use estes guias para o trabalho que você faz no portal. Eles mostram os nomes reais das telas e explicam cada status.',
      revision: 'Revisão',
      language: 'Idioma do guia',
      download: 'Baixar PDF',
      downloading: 'Preparando PDF…',
      retryDownload: 'Tentar baixar novamente',
      signInAgain: 'Sua sessão terminou. Entre novamente para baixar este guia.',
      signInAction: 'Entrar',
      accessHelp:
        'Este guia não está disponível para sua conta. Peça ao administrador para confirmar seu acesso.',
      temporaryHelp:
        'O PDF continua indisponível após as tentativas. Tente novamente ou contate o suporte.',
      laterHelp: 'O servidor pediu para aguardar. Tente novamente mais tarde ou contate o suporte.',
      contactSupport: 'Contatar suporte',
      availableLanguages: 'Idiomas disponíveis',
      quickStart: 'Início rápido',
      detailed: 'Referência detalhada',
      sharedChapters:
        'Este guia contém capítulos compartilhados. Leia as seções do seu perfil e suas tarefas permitidas.',
      rolePaths: 'Sou deste perfil: por onde começo?',
      worker: 'Tarefas do colaborador',
      owner: 'Referência por perfil',
      privateNote:
        'Sua visão Meu pagamento é privada. Uma estimativa ou declaração não é um contracheque e não prova que o dinheiro foi pago.',
      support: 'Para problemas de convite, acesso ou senha, contate admin@j-aautomation.com.',
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
        'Use o relatório diário para um resumo factual e o relatório técnico / PLC para trabalho e validação técnica. Nunca assine pelo cliente.',
      taskPay:
        'Meu pagamento separa estimado, aprovado, programado e pago. Programado é uma data esperada, não prova de pagamento.',
      tasksHeading: 'Um dia normal de relance',
      noGuides: 'Nenhum guia está atribuído a esta conta. Use o canal verificado no seu convite.',
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
  const visiblePaths = (manual: Manual): readonly Persona[] =>
    data.user.persona && manual.allowedPersonas.includes(data.user.persona)
      ? [data.user.persona]
      : manual.allowedPersonas;
  async function downloadManual(manual: Manual): Promise<void> {
    if (busyManualId) return;
    busyManualId = manual.id;
    downloadFailure = null;
    const controller = new AbortController();
    activeDownload = controller;
    try {
      const result = await fetchManualWithRetry(
        downloadHref(manual),
        fetch,
        undefined,
        controller.signal,
      );
      if (!result.ok) {
        if (result.failure === 'cancelled' || destroyed) return;
        downloadFailure = { id: manual.id, reason: result.failure };
        return;
      }
      const href = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = manualDownloadFilename(manual.id, result.language, manual.revision);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
    } catch {
      if (!destroyed) downloadFailure = { id: manual.id, reason: 'temporary' };
    } finally {
      if (activeDownload === controller) activeDownload = null;
      if (!destroyed) busyManualId = null;
    }
  }
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
                {manual.id === 'employee-field-guide' ? text('quickStart') : text('detailed')}
              </p>
              <h2>{title(manual)}</h2>
            </div>
            <span class="revision">{text('revision')} {manual.revision}</span>
          </div>
          <p>{description(manual)}</p>
          {#if manual.audience !== 'quick-start'}
            <div class="role-guidance">
              <div class="role-badges">
                {#each manual.allowedPersonas as persona}
                  <span>{roleNames[persona][data.locale]}</span>
                {/each}
              </div>
              <p>{text('sharedChapters')}</p>
              <h3>{text('rolePaths')}</h3>
              {#each visiblePaths(manual) as persona}
                <p>
                  <strong>{roleNames[persona][data.locale]}:</strong>
                  {readingPaths[persona][data.locale]}
                </p>
              {/each}
            </div>
          {/if}
          <div class="manual-actions">
            <a
              class="download"
              href={downloadHref(manual)}
              download
              aria-busy={busyManualId === manual.id}
              aria-disabled={busyManualId !== null}
              onclick={(event) => {
                event.preventDefault();
                void downloadManual(manual);
              }}>{busyManualId === manual.id ? text('downloading') : text('download')}</a
            >
            <span class="available"
              >{text('availableLanguages')}: {manual.locales
                .map((item) => localeNames[item])
                .join(', ')}</span
            >
          </div>
          {#if downloadFailure?.id === manual.id}
            <div class="download-feedback" role="alert">
              <p>
                {downloadFailure.reason === 'sign-in'
                  ? text('signInAgain')
                  : downloadFailure.reason === 'access'
                    ? text('accessHelp')
                    : downloadFailure.reason === 'later'
                      ? text('laterHelp')
                      : text('temporaryHelp')}
              </p>
              {#if downloadFailure.reason === 'sign-in'}
                <a href={`${base}/app/login`}>{text('signInAction')}</a>
              {:else if downloadFailure.reason === 'temporary'}
                <button type="button" onclick={() => void downloadManual(manual)}
                  >{text('retryDownload')}</button
                >
              {/if}
              {#if downloadFailure.reason !== 'sign-in'}
                <a href="mailto:admin@j-aautomation.com">{text('contactSupport')}</a>
              {/if}
            </div>
          {/if}
        </article>
      {/each}
    </section>
  {/if}

  <section class="tasks" aria-labelledby="tasks-heading">
    <h2 id="tasks-heading">{text('tasksHeading')}</h2>
    <div class="task-grid">
      {#each helpWorkflows(data.user.role ?? 'worker', data.user.workforceProfile, data.locale) as topic}
        <article>
          <h3><a href={`${base}/app/${topic.route}`}>{topic.title} →</a></h3>
          <p>{topic.body}</p>
        </article>
      {/each}
    </div>
  </section>

  <aside class="notice notice-private">
    {#if data.user.role === 'worker' && !data.user.workforceProfile}<p>
        {text('privateNote')}
      </p>{/if}
    <p>{text('support')}</p>
  </aside>
</main>

<style>
  :global(body) {
    background: #f7f7f6;
  }
  .help-page {
    max-width: 1120px;
    margin: 0 auto;
    padding: 2.5rem clamp(1rem, 4vw, 3rem) 4rem;
    color: #21201e;
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
    color: #5d5c55;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin: 0 0 0.45rem;
  }
  h1 {
    color: #353430;
    font-size: clamp(1.8rem, 4vw, 2.6rem);
    line-height: 1.1;
    margin: 0 0 0.75rem;
  }
  h2 {
    color: #353430;
    font-size: 1.2rem;
    line-height: 1.25;
    margin: 0;
  }
  h3 {
    color: #353430;
    font-size: 1rem;
    margin: 0 0 0.35rem;
  }
  p {
    line-height: 1.55;
    margin: 0 0 0.75rem;
  }
  .lead {
    max-width: 720px;
    color: #575650;
    margin: 0;
  }
  .language-control {
    min-width: 145px;
  }
  .language-control > span {
    display: block;
    color: #575650;
    font-size: 0.8rem;
    font-weight: 700;
    margin-bottom: 0.35rem;
  }
  .language-links {
    display: flex;
    gap: 0.35rem;
  }
  .language-links a {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 2.75rem;
    min-height: 2.75rem;
    box-sizing: border-box;
    color: #4e4d47;
    border: 1px solid #c9c8c4;
    border-radius: 0.4rem;
    padding: 0.35rem 0.55rem;
    text-decoration: none;
    font-size: 0.8rem;
    font-weight: 700;
  }
  .language-links a.current {
    background: #4e4d47;
    color: white;
    border-color: #4e4d47;
  }
  .notice,
  .manual-card,
  .tasks {
    background: white;
    border: 1px solid #e1e0de;
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
    border-left: 4px solid #848279;
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
    color: #67675f;
    font-size: 0.72rem;
    white-space: nowrap;
  }
  .manual-card > p {
    color: #575650;
  }
  .role-guidance {
    color: #575650;
    font-size: 0.88rem;
    margin-bottom: 0.75rem;
  }
  .role-guidance p {
    margin-bottom: 0.5rem;
  }
  .role-guidance h3 {
    font-size: 0.88rem;
    margin-bottom: 0.4rem;
  }
  .role-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-bottom: 0.75rem;
  }
  .role-badges span {
    background: #f2f2f1;
    color: #4e4d47;
    border-radius: 999px;
    padding: 0.25rem 0.55rem;
    font-weight: 700;
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
    min-height: 2.75rem;
    box-sizing: border-box;
    align-items: center;
    border-radius: 0.45rem;
    background: #4e4d47;
    color: white;
    padding: 0.55rem 0.8rem;
    text-decoration: none;
    font-weight: 700;
  }
  .download:focus-visible,
  .language-links a:focus-visible,
  .download-feedback button:focus-visible,
  .download-feedback a:focus-visible {
    outline: 3px solid #f59e0b;
    outline-offset: 2px;
  }
  .available {
    color: #67675f;
    font-size: 0.78rem;
  }
  .download-feedback {
    margin-top: 0.75rem;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem 0.75rem;
  }
  .download-feedback p {
    flex-basis: 100%;
    margin: 0;
  }
  .download-feedback button,
  .download-feedback a {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.75rem;
    box-sizing: border-box;
    border-radius: 0.45rem;
    padding: 0.55rem 0.8rem;
    font: inherit;
    font-weight: 700;
  }
  .download-feedback button {
    border: 1px solid #4e4d47;
    background: #4e4d47;
    color: white;
    cursor: pointer;
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
    background: #fafaf9;
    border: 1px solid #e8e8e6;
    border-radius: 0.55rem;
    padding: 0.85rem;
  }
  .task-grid p {
    color: #575650;
    font-size: 0.9rem;
    margin: 0;
  }
  .notice-private {
    margin-top: 1.25rem;
    background: #f7f6f6;
    border-color: #d7d7d3;
  }
  .notice-private p:last-child {
    margin-bottom: 0;
  }
  .empty {
    background: white;
    border: 1px solid #e1e0de;
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
