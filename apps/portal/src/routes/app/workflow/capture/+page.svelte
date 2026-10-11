<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { normalizePortalLocale, portalText } from '$lib/portal-i18n';
  import { workflowStatus } from '$lib/portal/workflow/copy';
  import { enhance } from '$app/forms';
  import { onMount } from 'svelte';
  import {
    clearLocalCaptureDraft,
    readLocalCaptureDraft,
    saveLocalCaptureDraft,
  } from '$lib/portal/field-capture/local-draft';
  import LocalDictation from '$lib/portal/local-dictation/LocalDictation.svelte';
  import LocalDocumentText from '$lib/portal/local-document-text/LocalDocumentText.svelte';
  import { expenseCategories } from '$lib/portal/expense-categories';
  import type { PageData, ActionData } from './$types';

  export let data: PageData;
  export let form: ActionData;
  type Locale = 'en' | 'es' | 'pt';
  let locale: Locale = 'en';
  $: locale = normalizePortalLocale($page.url.searchParams.get('lang') ?? $page.data.locale);
  let requestKey = cryptoSafeKey();
  let projectId = '';
  let workDate = '';
  let workSummary = '';
  let includeTime = false;
  let timeCategory = '';
  let minutes = '';
  let includeReport = false;
  let tasksCompleted = '';
  let siteShift = '';
  let problemsFound = '';
  let correctiveActions = '';
  let clientDecisions = '';
  let downtimeMinutes = '0';
  let standbyReason = '';
  let blockers = '';
  let openItems = '';
  let nextDayPlan = '';
  let safetyRelated = false;
  let customerContact = '';
  let includeExpense = false;
  let expenseCategory = '';
  let expenseDescription = '';
  let currency = '';
  let amount = '';
  let whoPaid = '';
  let vendor = '';
  let localState = '';
  let touched = false;
  let draftTimer: ReturnType<typeof setTimeout> | undefined;
  let activeScope = '';
  let reviewing = false;
  let recovering = false;

  function cryptoSafeKey() {
    return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '';
  }
  const words = {
    en: {
      title: 'Finish today',
      timeRecord: 'Open time entry',
      reportRecord: 'Open daily report',
      expenseRecord: 'Open expense',
      yes: 'Yes',
      no: 'No',
      intro: 'Record only facts you know. Review them before creating server drafts.',
      local: 'Saved on this device only',
      remote: 'Server drafts created. Open each record to review and submit it.',
      project: 'Project',
      date: 'Work date',
      summary: 'What work happened?',
      time: 'Create time draft',
      category: 'Category',
      minutes: 'Actual minutes worked',
      report: 'Create daily report draft',
      tasks: 'Tasks completed',
      site: 'Site / shift',
      problems: 'Problems found',
      corrective: 'Corrective actions',
      decisions: 'Client decisions',
      downtime: 'Downtime minutes',
      standby: 'Standby reason',
      blockers: 'Blockers',
      open: 'Open items',
      next: 'Next day plan',
      safety: 'Safety related',
      contact: 'Customer contact',
      expense: 'Create expense draft',
      expenseCategory: 'Expense category',
      description: 'Expense description',
      currency: 'Currency',
      amount: 'Actual amount',
      payer: 'Who paid?',
      vendor: 'Vendor',
      review: 'Review facts',
      save: 'Save on this device',
      create: 'Create server drafts',
      back: 'Edit facts',
      receipt:
        'After creating an expense draft, add its receipt on the expense detail page before submission. No file is uploaded here.',
      supplier:
        'Use the existing supplier time and report workflow for supplier coordinated entries.',
      needOne: 'Choose at least one draft.',
      noDefault: 'Enter actual minutes. No planned or minimum hours are used.',
      recovered: 'Recovered a draft saved on this device.',
      offline:
        'This is stored on this device only. Server authorization is checked when you create drafts.',
      retry: 'If a request fails after sending, retry with the same request key and facts.',
    },
    es: {
      title: 'Terminar hoy',
      timeRecord: 'Abrir registro de tiempo',
      reportRecord: 'Abrir informe diario',
      expenseRecord: 'Abrir gasto',
      yes: 'Sí',
      no: 'No',
      intro:
        'Registra solo hechos que conoces. Revísalos antes de crear borradores en el servidor.',
      local: 'Guardado solo en este dispositivo',
      remote: 'Borradores creados en el servidor. Abre cada registro para revisarlo y enviarlo.',
      project: 'Proyecto',
      date: 'Fecha de trabajo',
      summary: '¿Qué trabajo se realizó?',
      time: 'Crear borrador de tiempo',
      category: 'Categoría',
      minutes: 'Minutos reales trabajados',
      report: 'Crear borrador de informe diario',
      tasks: 'Tareas completadas',
      site: 'Lugar / turno',
      problems: 'Problemas encontrados',
      corrective: 'Acciones correctivas',
      decisions: 'Decisiones del cliente',
      downtime: 'Minutos de parada',
      standby: 'Motivo de espera',
      blockers: 'Bloqueos',
      open: 'Pendientes',
      next: 'Plan del próximo día',
      safety: 'Relacionado con seguridad',
      contact: 'Contacto del cliente',
      expense: 'Crear borrador de gasto',
      expenseCategory: 'Categoría de gasto',
      description: 'Descripción del gasto',
      currency: 'Moneda',
      amount: 'Importe real',
      payer: '¿Quién pagó?',
      vendor: 'Proveedor',
      review: 'Revisar hechos',
      save: 'Guardar en este dispositivo',
      create: 'Crear borradores en el servidor',
      back: 'Editar hechos',
      receipt:
        'Tras crear el borrador de gasto, añade el justificante en la página del gasto antes de enviarlo. Aquí no se sube ningún archivo.',
      supplier:
        'Usa el flujo existente de tiempo e informes de proveedores para registros coordinados.',
      needOne: 'Elige al menos un borrador.',
      noDefault: 'Introduce minutos reales. No se usan horas previstas ni mínimas.',
      recovered: 'Se recuperó un borrador de este dispositivo.',
      offline:
        'Solo se guarda en este dispositivo. La autorización se comprueba al crear los borradores.',
      retry:
        'Si falla una solicitud después del envío, repítela con la misma clave y los mismos hechos.',
    },
    pt: {
      title: 'Concluir hoje',
      timeRecord: 'Abrir registo de tempo',
      reportRecord: 'Abrir relatório diário',
      expenseRecord: 'Abrir despesa',
      yes: 'Sim',
      no: 'Não',
      intro: 'Registe apenas factos que conhece. Reveja-os antes de criar rascunhos no servidor.',
      local: 'Guardado apenas neste dispositivo',
      remote: 'Rascunhos criados no servidor. Abra cada registo para rever e submeter.',
      project: 'Projeto',
      date: 'Data de trabalho',
      summary: 'Que trabalho foi realizado?',
      time: 'Criar rascunho de tempo',
      category: 'Categoria',
      minutes: 'Minutos reais trabalhados',
      report: 'Criar rascunho de relatório diário',
      tasks: 'Tarefas concluídas',
      site: 'Local / turno',
      problems: 'Problemas encontrados',
      corrective: 'Ações corretivas',
      decisions: 'Decisões do cliente',
      downtime: 'Minutos de paragem',
      standby: 'Motivo de espera',
      blockers: 'Impedimentos',
      open: 'Itens em aberto',
      next: 'Plano para o dia seguinte',
      safety: 'Relacionado com segurança',
      contact: 'Contacto do cliente',
      expense: 'Criar rascunho de despesa',
      expenseCategory: 'Categoria da despesa',
      description: 'Descrição da despesa',
      currency: 'Moeda',
      amount: 'Valor real',
      payer: 'Quem pagou?',
      vendor: 'Fornecedor',
      review: 'Rever factos',
      save: 'Guardar neste dispositivo',
      create: 'Criar rascunhos no servidor',
      back: 'Editar factos',
      receipt:
        'Depois de criar o rascunho da despesa, adicione o recibo na página da despesa antes de submeter. Nenhum ficheiro é enviado aqui.',
      supplier:
        'Use o fluxo existente de tempo e relatórios de fornecedores para entradas coordenadas.',
      needOne: 'Escolha pelo menos um rascunho.',
      noDefault: 'Introduza minutos reais. Não são usadas horas planeadas ou mínimas.',
      recovered: 'Rascunho recuperado deste dispositivo.',
      offline: 'Guardado apenas neste dispositivo. A autorização é verificada ao criar rascunhos.',
      retry: 'Se um pedido falhar após o envio, repita com a mesma chave e os mesmos factos.',
    },
  };
  $: t = words[locale];
  const payerNames: Record<string, string> = {
    worker: 'Worker',
    company_card: 'Company card',
    company_direct: 'Company direct',
    client: 'Client',
    third_party: 'Third party',
  };
  $: reportReview = [
    [t.tasks, tasksCompleted],
    [t.site, siteShift],
    [t.problems, problemsFound],
    [t.corrective, correctiveActions],
    [t.decisions, clientDecisions],
    [t.downtime, String(downtimeMinutes)],
    [t.standby, standbyReason],
    [t.blockers, blockers],
    [t.open, openItems],
    [t.next, nextDayPlan],
    [t.safety, safetyRelated ? t.yes : t.no],
    [t.contact, customerContact],
  ].filter(([, value]) => String(value).trim());
  $: expenseReview = [
    [
      t.expenseCategory,
      portalText(
        locale,
        expenseCategories.find(([value]) => value === expenseCategory)?.[1] ?? expenseCategory,
      ),
    ],
    [t.vendor, vendor],
    [t.description, expenseDescription],
    [t.amount, `${amount} ${currency}`],
    [t.payer, portalText(locale, payerNames[whoPaid] ?? whoPaid)],
  ].filter(([, value]) => String(value).trim());
  $: selectedProject = data.projects.find((item) => item.id === projectId);
  $: if (selectedProject && !currency && !touched) currency = selectedProject.currency;

  function values(): Record<string, string | boolean> {
    return {
      requestKey,
      projectId,
      workDate,
      workSummary,
      includeTime,
      timeCategory,
      minutes,
      includeReport,
      tasksCompleted,
      siteShift,
      problemsFound,
      correctiveActions,
      clientDecisions,
      downtimeMinutes,
      standbyReason,
      blockers,
      openItems,
      nextDayPlan,
      safetyRelated,
      customerContact,
      includeExpense,
      expenseCategory,
      expenseDescription,
      currency,
      amount,
      whoPaid,
      vendor,
    };
  }
  function restore(v: Record<string, string | boolean>) {
    requestKey = String(v.requestKey || cryptoSafeKey());
    workSummary = String(v.workSummary || '');
    includeTime = v.includeTime === true;
    timeCategory = String(v.timeCategory || '');
    minutes = String(v.minutes || '');
    includeReport = v.includeReport === true;
    tasksCompleted = String(v.tasksCompleted || '');
    siteShift = String(v.siteShift || '');
    problemsFound = String(v.problemsFound || '');
    correctiveActions = String(v.correctiveActions || '');
    clientDecisions = String(v.clientDecisions || '');
    downtimeMinutes = String(v.downtimeMinutes ?? '0');
    standbyReason = String(v.standbyReason || '');
    blockers = String(v.blockers || '');
    openItems = String(v.openItems || '');
    nextDayPlan = String(v.nextDayPlan || '');
    safetyRelated = v.safetyRelated === true;
    customerContact = String(v.customerContact || '');
    includeExpense = v.includeExpense === true;
    expenseCategory = String(v.expenseCategory || '');
    expenseDescription = String(v.expenseDescription || '');
    currency = String(v.currency || '');
    amount = String(v.amount || '');
    whoPaid = String(v.whoPaid || '');
    vendor = String(v.vendor || '');
  }
  async function saveDraft() {
    if (!projectId || !workDate || recovering) return;
    try {
      await saveLocalCaptureDraft({
        userId: data.userId,
        projectId,
        workDate,
        values: values(),
        savedAt: new Date().toISOString(),
      });
      localState = t.local;
    } catch {
      localState =
        locale === 'es'
          ? 'No se pudo guardar en este dispositivo'
          : locale === 'pt'
            ? 'Não foi possível guardar neste dispositivo'
            : 'Could not save on this device';
    }
  }
  function changed(event?: Event) {
    const name = (event?.target as HTMLInputElement | undefined)?.name;
    if (name === 'projectId' || name === 'workDate') {
      clearTimeout(draftTimer);
      reviewing = false;
      return;
    }
    if (recovering) return;
    touched = true;
    reviewing = false;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      void saveDraft();
    }, 600);
  }
  function useReviewedDocumentText(value: string) {
    expenseDescription = expenseDescription ? `${expenseDescription}\n${value}` : value;
    changed();
  }
  async function recoverScope(force = false) {
    const scope = JSON.stringify([data.userId, projectId, workDate]);
    if ((!force && scope === activeScope) || !projectId || !workDate) return;
    activeScope = scope;
    clearTimeout(draftTimer);
    recovering = true;
    reviewing = false;
    touched = false;
    localState = '';
    restore({ currency: selectedProject?.currency || '' });
    try {
      const draft = await readLocalCaptureDraft(data.userId, projectId, workDate);
      if (scope !== activeScope) return;
      if (draft) {
        restore(draft.values);
        localState = t.recovered;
        touched = false;
      }
    } catch {
      localState =
        locale === 'es'
          ? 'No se pudo leer el borrador local'
          : locale === 'pt'
            ? 'Não foi possível ler o rascunho local'
            : 'Could not read the local draft';
    } finally {
      if (scope === activeScope) recovering = false;
    }
  }
  onMount(() => {
    void recoverScope();
  });
  $: if (projectId && workDate) void recoverScope();
  const link = (type: string, id: string) =>
    `${base}/app/${type === 'time' ? 'time' : type === 'report' ? 'reports' : 'expenses'}/${encodeURIComponent(id)}`;
</script>

<svelte:head><title>{t.title} · J&A Automation</title></svelte:head>
<main class="capture">
  <header>
    <h1>{t.title}</h1>
    <p>{t.intro}</p>
  </header>
  {#if data.supplierCoordinator}
    <section class="card">
      <p>{t.supplier}</p>
      <a href={`${base}/app/supplier`}>Supplier workflow</a>
    </section>
  {:else}
    {#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
    {#if form?.success && form.result}
      <section class="card result" aria-live="polite">
        <h2>{t.remote}</h2>
        {#each form.result.records as record}<p>
            <a href={link(record.type, record.id)}
              >{record.type === 'time'
                ? t.timeRecord
                : record.type === 'report'
                  ? t.reportRecord
                  : t.expenseRecord}</a
            >
            · {workflowStatus(locale, record.state)}
          </p>{/each}
        <p>{t.receipt}</p>
      </section>
    {/if}
    {#if localState}<p class="local-status" role="status">{localState}. {t.offline}</p>{/if}
    {#if !form?.success}
      <form
        method="POST"
        use:enhance={() =>
          async ({ result, update }) => {
            await update({ reset: false });
            if (result.type === 'success' && projectId && workDate) {
              clearTimeout(draftTimer);
              await clearLocalCaptureDraft(data.userId, projectId, workDate);
              localState = '';
              requestKey = cryptoSafeKey();
              reviewing = false;
            }
          }}
        on:input={changed}
        on:change={changed}
      >
        <input type="hidden" name="requestKey" value={requestKey} />
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="confirmed" value={reviewing ? 'yes' : 'no'} />
        <fieldset disabled={recovering} class="capture-fields">
          <section class="card">
            <h2>{t.project} / {t.date}</h2>
            <div class="grid">
              <label
                >{t.project}<select name="projectId" bind:value={projectId} required
                  ><option value="">—</option>{#each data.projects as item}<option value={item.id}
                      >{item.name}</option
                    >{/each}</select
                ></label
              ><label
                >{t.date}<input name="workDate" type="date" bind:value={workDate} required /></label
              >
            </div>
            <label
              >{t.summary}<textarea name="workSummary" bind:value={workSummary} required rows="4"
              ></textarea></label
            >
            <LocalDictation
              {locale}
              onText={(text) => {
                workSummary = workSummary ? `${workSummary} ${text}` : text;
                changed();
              }}
            />
          </section>
          <section class="card">
            <h2>
              <label
                ><input type="checkbox" name="includeTime" bind:checked={includeTime} />
                {t.time}</label
              >
            </h2>
            {#if includeTime}<div class="grid">
                <label
                  >{t.category}<input
                    name="timeCategory"
                    bind:value={timeCategory}
                    required
                  /></label
                ><label
                  >{t.minutes}<input
                    name="minutes"
                    type="number"
                    min="1"
                    max="1440"
                    step="1"
                    bind:value={minutes}
                    required
                  /></label
                >
              </div>
              <p class="hint">{t.noDefault}</p>{/if}
          </section>
          <section class="card">
            <h2>
              <label
                ><input type="checkbox" name="includeReport" bind:checked={includeReport} />
                {t.report}</label
              >
            </h2>
            {#if includeReport}<label
                >{t.tasks}<textarea
                  name="tasksCompleted"
                  bind:value={tasksCompleted}
                  required
                  rows="2"
                ></textarea></label
              >
              <div class="grid">
                <label>{t.site}<input name="siteShift" bind:value={siteShift} /></label><label
                  >{t.downtime}<input
                    name="downtimeMinutes"
                    type="number"
                    min="0"
                    max="1440"
                    step="1"
                    bind:value={downtimeMinutes}
                    required
                  /></label
                >
              </div>
              <label
                >{t.problems}<textarea name="problemsFound" bind:value={problemsFound}
                ></textarea></label
              ><label
                >{t.corrective}<textarea name="correctiveActions" bind:value={correctiveActions}
                ></textarea></label
              ><label
                >{t.decisions}<textarea name="clientDecisions" bind:value={clientDecisions}
                ></textarea></label
              ><label>{t.standby}<input name="standbyReason" bind:value={standbyReason} /></label
              ><label>{t.blockers}<textarea name="blockers" bind:value={blockers}></textarea></label
              ><label>{t.open}<textarea name="openItems" bind:value={openItems}></textarea></label
              ><label
                >{t.next}<textarea name="nextDayPlan" bind:value={nextDayPlan}></textarea></label
              ><label
                >{t.contact}<input name="customerContact" bind:value={customerContact} /></label
              ><label class="check"
                ><input type="checkbox" name="safetyRelated" bind:checked={safetyRelated} />
                {t.safety}</label
              >{/if}
          </section>
          <section class="card">
            <h2>
              <label
                ><input type="checkbox" name="includeExpense" bind:checked={includeExpense} />
                {t.expense}</label
              >
            </h2>
            {#if includeExpense}<div class="grid">
                <label
                  >{t.expenseCategory}<select
                    name="expenseCategory"
                    bind:value={expenseCategory}
                    required
                    ><option value="">—</option>{#each expenseCategories as [value, label]}<option
                        {value}>{label}</option
                      >{/each}</select
                  ></label
                ><label>{t.vendor}<input name="vendor" bind:value={vendor} /></label>
              </div>
              <label
                >{t.description}<textarea
                  name="expenseDescription"
                  bind:value={expenseDescription}
                  required
                ></textarea></label
              >
              <LocalDocumentText
                {locale}
                inputId="capture-expense-document-text"
                onUse={useReviewedDocumentText}
              />
              <div class="grid">
                <label
                  >{t.amount}<input
                    name="amount"
                    inputmode="decimal"
                    bind:value={amount}
                    required
                  /></label
                ><label
                  >{t.currency}<select name="currency" bind:value={currency} required
                    ><option value="">—</option><option>EUR</option><option>USD</option><option
                      >BRL</option
                    ></select
                  ></label
                ><label
                  >{t.payer}<select name="whoPaid" bind:value={whoPaid} required
                    ><option value="">—</option
                    >{#each Object.entries(payerNames) as [value, label]}<option {value}
                        >{portalText(locale, label)}</option
                      >{/each}</select
                  ></label
                >
              </div>
              <p class="hint">{t.receipt}</p>{/if}
          </section>
          {#if reviewing}<section class="card review">
              <h2>{t.review}</h2>
              <p><strong>{t.project}:</strong> {selectedProject?.name} · {workDate}</p>
              <p><strong>{t.summary}:</strong> {workSummary}</p>
              {#if includeTime}<h3>{t.time}</h3>
                <dl class="review-facts">
                  <dt>{t.category}</dt>
                  <dd>{timeCategory}</dd>
                  <dt>{t.minutes}</dt>
                  <dd>{minutes}</dd>
                </dl>{/if}
              {#if includeReport}<h3>{t.report}</h3>
                <dl class="review-facts">
                  {#each reportReview as [label, value]}<dt>{label}</dt>
                    <dd>{value}</dd>{/each}
                </dl>{/if}
              {#if includeExpense}<h3>{t.expense}</h3>
                <dl class="review-facts">
                  {#each expenseReview as [label, value]}<dt>{label}</dt>
                    <dd>{value}</dd>{/each}
                </dl>{/if}
            </section>{/if}
          <div class="actions">
            <button
              type="button"
              on:click={() => void saveDraft()}
              disabled={!projectId || !workDate}>{t.save}</button
            ><button
              type="button"
              on:click={() => void recoverScope(true)}
              disabled={!projectId || !workDate}
              >{locale === 'es'
                ? 'Recuperar borrador local'
                : locale === 'pt'
                  ? 'Recuperar rascunho local'
                  : 'Recover local draft'}</button
            >{#if reviewing}<button type="button" on:click={() => (reviewing = false)}
                >{t.back}</button
              ><button type="submit" class="primary">{t.create}</button>{:else}<button
                type="button"
                class="primary"
                on:click={(event) => {
                  if (!includeTime && !includeReport && !includeExpense) {
                    localState = t.needOne;
                    return;
                  }
                  if (!event.currentTarget.closest('form')?.reportValidity()) return;
                  reviewing = true;
                }}>{t.review}</button
              >{/if}
          </div>
          <p class="hint">{t.retry}</p>
        </fieldset>
      </form>
    {/if}
  {/if}
</main>

<style>
  .review-facts {
    display: grid;
    gap: 0.35rem;
    margin: 0 0 1.25rem;
  }
  .review-facts dt {
    font-weight: 650;
  }
  .review-facts dd {
    margin: 0 0 0.65rem;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  .capture-fields {
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
  }
  .capture {
    max-width: 960px;
    margin: 0 auto;
    padding: clamp(16px, 3vw, 36px);
    color: var(--text-primary, #17252e);
  }
  header {
    margin-bottom: 24px;
  }
  h1 {
    font-size: clamp(1.8rem, 4vw, 2.5rem);
    margin: 0 0 8px;
  }
  h2 {
    font-size: 1.13rem;
    margin: 0 0 16px;
  }
  p {
    line-height: 1.5;
  }
  .card {
    background: var(--surface, #fff);
    border: 1px solid #cbd5df;
    border-radius: 12px;
    padding: clamp(16px, 2.5vw, 24px);
    margin: 0 0 16px;
    box-shadow: 0 1px 3px #0001;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
    gap: 16px;
  }
  label {
    display: block;
    font-weight: 650;
    margin-bottom: 16px;
  }
  label input:not([type='checkbox']),
  label select,
  label textarea {
    display: block;
    width: 100%;
    min-height: 44px;
    box-sizing: border-box;
    border: 1px solid #8899a8;
    border-radius: 7px;
    background: #fff;
    color: #17252e;
    padding: 10px;
    font: inherit;
    margin-top: 7px;
  }
  textarea {
    resize: vertical;
  }
  input:focus-visible,
  select:focus-visible,
  textarea:focus-visible,
  button:focus-visible,
  a:focus-visible {
    outline: 3px solid #0677a9;
    outline-offset: 2px;
  }
  h2 label,
  .check {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
  }
  h2 input[type='checkbox'],
  .check input {
    width: 22px;
    height: 22px;
    flex: none;
  }
  .hint {
    font-size: 0.92rem;
    color: #405567;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    position: sticky;
    bottom: 0;
    background: var(--surface, #fff);
    padding: 12px 0;
    border-top: 1px solid #cbd5df;
  }
  button {
    min-height: 44px;
    padding: 10px 16px;
    border: 1px solid #577183;
    border-radius: 7px;
    background: #fff;
    color: #17252e;
    font: inherit;
    cursor: pointer;
  }
  button.primary {
    background: #075a7e;
    color: white;
    border-color: #075a7e;
  }
  button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .error {
    background: #fff0ed;
    color: #842b20;
    border: 1px solid #ba5140;
    border-radius: 7px;
    padding: 12px;
  }
  .local-status {
    background: #edf5ff;
    border: 1px solid #6090bb;
    border-radius: 7px;
    padding: 12px;
  }
  .result {
    border-color: #4b906b;
  }
  .result a {
    overflow-wrap: anywhere;
  }
  .review p {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  @media (max-width: 390px) {
    .capture {
      padding: 14px;
    }
    .card {
      padding: 16px;
    }
    .actions button {
      flex: 1 1 100%;
    }
  }
</style>
