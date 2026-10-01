<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import type { PortalLocale } from '$lib/portal-i18n';

  export type PreviewField = {
    name: string;
    label: string;
    kind: 'text' | 'textarea' | 'date' | 'number' | 'checkbox';
    value: string;
    required?: boolean;
  };
  let {
    src,
    revision,
    locale = 'en',
    paperWidth = 794,
    paperHeight = 1123,
    fields = [],
    sourceFields = [],
    getField,
    updateField,
    saveField,
    saveState = '',
    saveMessage = '',
  }: {
    src: string;
    revision: string | number;
    locale?: PortalLocale;
    paperWidth?: number;
    paperHeight?: number;
    fields?: readonly string[];
    sourceFields?: readonly { name: string; label: string; href: string }[];
    getField?: (name: string) => PreviewField | null;
    updateField?: (name: string, value: string) => void;
    saveField?: () => Promise<boolean>;
    saveState?: string;
    saveMessage?: string;
  } = $props();
  const copy = $derived(
    locale === 'es'
      ? {
          title: 'Vista previa del documento',
          help: 'La vista previa y el PDF descargado usan el mismo diseño. Seleccione un campo resaltado para editar el registro original.',
          readOnly:
            'Esta vista previa refleja los datos guardados. Edite los registros de origen autorizados para cambiar el contenido.',
          loading: 'Cargando vista previa…',
          unavailable:
            'No se pudo cargar la vista previa. Vuelva a cargar el documento o revise su acceso.',
          edit: 'Editar',
          close: 'Guardar y cerrar',
          dismiss: 'Cerrar editor',
          zoom: 'Tamaño real',
          fit: 'Ajustar al ancho',
          saving: 'Guardando…',
          source:
            'Los cambios se guardan en el reporte original. La vista previa se actualiza después de confirmar el guardado.',
        }
      : locale === 'pt'
        ? {
            title: 'Prévia do documento',
            help: 'A prévia e o PDF baixado usam o mesmo layout. Selecione um campo destacado para editar o registro original.',
            readOnly:
              'Esta prévia reflete os dados salvos. Edite os registros de origem autorizados para alterar o conteúdo.',
            loading: 'Carregando prévia…',
            unavailable:
              'Não foi possível carregar a prévia. Recarregue o documento ou verifique seu acesso.',
            edit: 'Editar',
            close: 'Salvar e fechar',
            dismiss: 'Fechar editor',
            zoom: 'Tamanho real',
            fit: 'Ajustar à largura',
            saving: 'Salvando…',
            source:
              'As alterações são salvas no relatório original. A prévia é atualizada após a confirmação do salvamento.',
          }
        : {
            title: 'Document preview',
            help: 'The preview and downloaded PDF use the same layout. Select a highlighted field to edit the original record.',
            readOnly:
              'This preview reflects saved data. Edit authorized source records to change its content.',
            loading: 'Loading document preview…',
            unavailable:
              'The preview could not be loaded. Reload the document or review your access.',
            edit: 'Edit',
            close: 'Save and close',
            dismiss: 'Close editor',
            zoom: 'Actual size',
            fit: 'Fit to width',
            saving: 'Saving…',
            source:
              'Changes save to the original report. The preview refreshes after the save is acknowledged.',
          },
  );
  let container: HTMLDivElement;
  let iframe: HTMLIFrameElement;
  let dialog: HTMLDialogElement;
  let width = $state(794);
  let height = $state(1123);
  let loaded = $state(false);
  let mounted = $state(false);
  let failed = $state(false);
  let editor = $state<PreviewField | null>(null);
  let value = $state('');
  let busy = $state(false);
  let actualSize = $state(false);
  let returnTarget: HTMLElement | null = null;
  const scale = $derived(actualSize ? 1 : Math.min(1, Math.max(1, width) / paperWidth));
  const url = $derived(
    `${src}${src.includes('?') ? '&' : '?'}revision=${encodeURIComponent(String(revision))}`,
  );
  let documentResize: ResizeObserver | null = null;
  let decoratedDocument: Document | null = null;
  async function edit(name: string, target: HTMLElement): Promise<void> {
    const selected = getField?.(name);
    if (!selected) return;
    editor = selected;
    value = selected.value;
    returnTarget = target;
    await tick();
    dialog?.showModal();
    dialog?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')?.focus();
  }
  function load(): void {
    documentResize?.disconnect();
    const doc = iframe?.contentDocument;
    const body = doc?.body;
    // Auth failures and error pages deliberately never masquerade as ready previews.
    if (!doc || !body || !doc.querySelector('meta[name="template-version"]')) {
      loaded = false;
      failed = true;
      return;
    }
    loaded = true;
    failed = false;
    const resize = () => {
      height = Math.max(paperHeight, body.scrollHeight, doc.documentElement.scrollHeight);
    };
    resize();
    documentResize = new ResizeObserver(resize);
    documentResize.observe(body);
    if (decoratedDocument === doc) return;
    decoratedDocument = doc;
    const style = doc.createElement('style');
    style.textContent =
      '[data-preview-editable] { cursor:pointer; outline:1px dashed #94a3b8; outline-offset:3px; } [data-preview-editable]:hover, [data-preview-editable]:focus-visible { outline:2px solid #e23d2d; background:#fff4ed; }';
    doc.head.append(style);
    for (const field of Array.from(doc.querySelectorAll<HTMLElement>('[data-report-field]'))) {
      const name = field.dataset.reportField ?? '';
      const source = sourceFields.find((item) => item.name === name);
      if ((!fields.includes(name) || !getField?.(name)) && !source) continue;
      field.dataset.previewEditable = 'true';
      field.tabIndex = 0;
      field.setAttribute('role', source ? 'link' : 'button');
      field.setAttribute(
        'aria-label',
        source?.label ?? `${copy.edit}: ${getField?.(name)?.label ?? name}`,
      );
      const activate = () => (source ? void goto(source.href) : void edit(name, field));
      field.addEventListener('click', activate);
      field.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      });
    }
  }
  // Native listeners work under the portal's nonce-only script policy. An
  // already-loaded SSR frame also needs recovery when hydration binds it.
  function observeFrame(node: HTMLIFrameElement, currentUrl: string) {
    let active = true;
    let generation = 0;
    const ready = () => {
      if (!active || node.contentDocument?.URL !== node.src) return;
      load();
    };
    const unavailable = () => {
      if (active) {
        loaded = false;
        failed = true;
      }
    };
    const completed = () => {
      if (!active) return;
      if (node.contentDocument?.URL === node.src) load();
      else unavailable();
    };
    const refresh = (initial = false) => {
      loaded = false;
      failed = false;
      const attempt = ++generation;
      queueMicrotask(() => {
        if (!active || attempt !== generation) return;
        const doc = node.contentDocument;
        if (doc?.readyState === 'complete') {
          if (initial && doc.URL !== node.src && doc.URL !== 'about:blank') unavailable();
          else ready();
        } else if (initial && !doc) unavailable();
      });
    };
    node.addEventListener('load', completed);
    node.addEventListener('error', unavailable);
    refresh(true);
    return {
      update(nextUrl: string) {
        if (nextUrl !== currentUrl) {
          currentUrl = nextUrl;
          refresh();
        }
      },
      destroy() {
        active = false;
        node.removeEventListener('load', completed);
        node.removeEventListener('error', unavailable);
        documentResize?.disconnect();
        decoratedDocument = null;
      },
    };
  }
  // Style properties are applied after hydration, so strict CSP does not see an SSR style attribute.
  function sizePaper(node: HTMLDivElement, size: { width: number; height: number }) {
    const apply = (next: { width: number; height: number }) => {
      node.style.maxWidth = `${next.width}px`;
      node.style.height = `${next.height}px`;
    };
    apply(size);
    return { update: apply };
  }
  function changed(next: string): void {
    value = next;
    if (editor) updateField?.(editor.name, next);
  }
  function dismiss(): void {
    dialog?.close();
    editor = null;
    if (returnTarget?.isConnected) returnTarget.focus();
    else iframe?.focus();
  }
  async function close(): Promise<void> {
    if (busy) return;
    busy = true;
    const saved = !saveField || (await saveField());
    busy = false;
    if (!saved) return;
    dismiss();
  }
  onMount(() => {
    mounted = true;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) width = entry.contentRect.width;
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      documentResize?.disconnect();
    };
  });
</script>

<section class="document-preview no-print" aria-label={copy.title} data-report-document-preview>
  <header>
    <h2>{copy.title}</h2>
    <p>{fields.length ? copy.help : copy.readOnly}</p>
    <button
      type="button"
      class="zoom-toggle"
      aria-pressed={actualSize}
      onclick={() => {
        actualSize = !actualSize;
      }}>{actualSize ? copy.fit : copy.zoom}</button
    >
    {#if saveMessage && fields.length}<p
        role="status"
        aria-live="polite"
        data-preview-save-state={saveState}
      >
        {saveMessage}
      </p>{/if}
  </header>
  {#if !loaded}<p class="preview-status" role="status">
      {failed ? copy.unavailable : copy.loading}
    </p>{/if}
  <div
    class="paper-frame"
    class:actual-size={actualSize}
    bind:this={container}
    use:sizePaper={{ width: paperWidth, height: loaded ? height * scale : 220 }}
  >
    {#if mounted}<iframe
        bind:this={iframe}
        src={url}
        title={copy.title}
        sandbox="allow-same-origin"
        use:observeFrame={url}
        style:width={`${paperWidth}px`}
        style:height={`${height}px`}
        style:transform={`scale(${scale})`}
        class:loading={!loaded}
      ></iframe>{/if}
  </div>
</section>

<dialog
  bind:this={dialog}
  class="preview-editor"
  oncancel={(event) => {
    event.preventDefault();
    dismiss();
  }}
  aria-label={editor ? `${copy.edit}: ${editor.label}` : copy.edit}
>
  {#if editor}
    <h2>{copy.edit}: {editor.label}</h2>
    <p>{copy.source}</p>
    <label for="preview-source-field">{editor.label}</label>
    {#if editor.kind === 'textarea'}
      <textarea
        id="preview-source-field"
        {value}
        required={editor.required}
        oninput={(event) => changed(event.currentTarget.value)}
      ></textarea>
    {:else if editor.kind === 'checkbox'}
      <input
        id="preview-source-field"
        type="checkbox"
        checked={value === 'on'}
        onchange={(event) => changed(event.currentTarget.checked ? 'on' : 'off')}
      />
    {:else}
      <input
        id="preview-source-field"
        type={editor.kind}
        {value}
        required={editor.required}
        oninput={(event) => changed(event.currentTarget.value)}
      />
    {/if}
    <p role="status" aria-live="polite" data-preview-editor-save-state={saveState}>{saveMessage}</p>
    <button type="button" disabled={busy || saveState === 'saving'} onclick={() => void close()}
      >{busy || saveState === 'saving' ? copy.saving : copy.close}</button
    >
    <button type="button" class="dismiss" onclick={dismiss}>{copy.dismiss}</button>
  {/if}
</dialog>

<style>
  .document-preview {
    min-width: 0;
    margin: 1.5rem 0;
    border: 1px solid #d9e1e7;
    border-radius: 1rem;
    background: #e9edf1;
    overflow: hidden;
  }
  header {
    padding: 1rem 1.25rem;
    background: #fff;
    border-bottom: 1px solid #d9e1e7;
  }
  h2 {
    margin: 0;
    font-size: 1.1rem;
  }
  p {
    margin: 0.5rem 0 0;
    color: #475569;
    line-height: 1.5;
  }
  .paper-frame {
    position: relative;
    width: 100%;
    max-width: 794px;
    height: 220px;
    margin: 1rem auto;
    overflow: hidden;
    background: white;
  }
  iframe {
    position: absolute;
    inset: 0;
    border: 0;
    transform-origin: top left;
  }
  iframe.loading {
    visibility: hidden;
  }
  .paper-frame.actual-size {
    overflow: auto;
  }
  .zoom-toggle {
    min-height: 44px;
    margin-top: 0.75rem;
    padding: 0.5rem 0.75rem;
    background: white;
    color: #0f2d3d;
    border: 1px solid #94a3b8;
    border-radius: 0.5rem;
    font: inherit;
    cursor: pointer;
  }
  .zoom-toggle:focus-visible {
    outline: 3px solid #e23d2d;
    outline-offset: 3px;
  }
  .preview-status {
    padding: 1rem;
  }
  .preview-editor {
    width: min(36rem, calc(100vw - 2rem));
    max-height: calc(100dvh - 2rem);
    overflow: auto;
    border: 1px solid #cbd5e1;
    border-radius: 1rem;
    padding: 1.25rem;
    color: #17212b;
  }
  .preview-editor::backdrop {
    background: rgb(15 23 42 / 0.5);
  }
  .preview-editor label {
    display: block;
    margin: 1.25rem 0 0.5rem;
    font-weight: 700;
  }
  .preview-editor input:not([type='checkbox']),
  .preview-editor textarea {
    width: 100%;
    font: inherit;
    padding: 0.75rem;
    border: 1px solid #94a3b8;
    border-radius: 0.5rem;
  }
  .preview-editor textarea {
    min-height: 10rem;
    resize: vertical;
  }
  .preview-editor input[type='checkbox'] {
    width: 1.5rem;
    height: 1.5rem;
  }
  .preview-editor button {
    min-height: 44px;
    margin-top: 1rem;
    padding: 0.65rem 1rem;
    border: 0;
    border-radius: 0.5rem;
    background: #0f2d3d;
    color: white;
    font: inherit;
    font-weight: 700;
  }
  .preview-editor button.dismiss {
    background: white;
    color: #0f2d3d;
    border: 1px solid #94a3b8;
    margin-left: 0.5rem;
  }
  .preview-editor button:disabled {
    opacity: 0.6;
  }
  .preview-editor :focus-visible {
    outline: 3px solid #e23d2d;
    outline-offset: 3px;
  }
</style>
