<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import type { PortalLocale } from '$lib/portal-i18n';
  import { privateDownloadFilename } from './private-document-download';

  let {
    src,
    locale = 'en',
    onFailure,
  }: {
    src: string;
    locale?: PortalLocale;
    onFailure?: (
      payload: unknown,
      status: number,
      reference: string | null,
    ) => void | Promise<void>;
  } = $props();
  const copy = $derived(
    locale === 'es'
      ? {
          title: 'Vista previa del PDF guardado',
          help: 'Esta vista muestra el mismo archivo que se descarga, incluido su diseño original. Los totales y las versiones históricas conservan sus datos guardados.',
          loading: 'Cargando el PDF guardado…',
          failure:
            'No se pudo verificar esta vista previa. Revise el estado del archivo o use la acción de descarga.',
          retry: 'Reintentar vista previa',
          fallback: 'Si el navegador no muestra el PDF, use la acción de descarga.',
        }
      : locale === 'pt'
        ? {
            title: 'Prévia do PDF salvo',
            help: 'Esta prévia mostra o mesmo arquivo baixado, incluindo seu layout original. Totais e versões históricas preservam os dados salvos.',
            loading: 'Carregando o PDF salvo…',
            failure:
              'Não foi possível verificar esta prévia. Verifique o status do arquivo ou use a ação de download.',
            retry: 'Tentar prévia novamente',
            fallback: 'Se o navegador não exibir o PDF, use a ação de download.',
          }
        : {
            title: 'Saved PDF preview',
            help: 'This shows the same file you download, including its original layout. Totals and historical versions preserve their saved data.',
            loading: 'Loading saved PDF…',
            failure:
              'This preview could not be verified. Review the artifact status or use its download action.',
            retry: 'Retry preview',
            fallback: 'If your browser does not display the PDF, use its download action.',
          },
  );
  let mounted = $state(false);
  let loading = $state(false);
  let failed = $state(false);
  let filename = $state('');
  let blobUrl = $state('');
  let controller: AbortController | null = null;
  let objectUrl: string | null = null;
  function clear(): void {
    controller?.abort();
    controller = null;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    blobUrl = '';
  }
  function generatedPdfSource(url: URL): boolean {
    const prefix = `${base}/app/api/`;
    return (
      url.origin === window.location.origin &&
      !url.username &&
      !url.password &&
      !url.hash &&
      url.pathname.startsWith(prefix) &&
      /^(?:worker-statement\/artifacts\/[^/]+\/download|accounting-pack\/[^/]+\/pdf)$/u.test(
        url.pathname.slice(prefix.length),
      )
    );
  }
  async function load(): Promise<void> {
    clear();
    if (!mounted) return;
    const attempt = new AbortController();
    controller = attempt;
    loading = true;
    failed = false;
    filename = '';
    try {
      // This native viewer accepts only generated, authorized artifact routes, never raw uploads.
      const requestUrl = new URL(src, window.location.origin);
      if (!generatedPdfSource(requestUrl)) {
        failed = true;
        return;
      }
      const response = await fetch(requestUrl.href, {
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        signal: attempt.signal,
        headers: { accept: 'application/pdf' },
      });
      if (controller !== attempt) return;
      if (response.redirected || !generatedPdfSource(new URL(response.url))) {
        failed = true;
        return;
      }
      const type = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
      if (!response.ok || type !== 'application/pdf') {
        let payload: unknown = null;
        try {
          payload = await response.json();
        } catch {
          /* Typed status remains available when a proxy returns HTML. */
        }
        if (controller !== attempt) return;
        failed = true;
        await onFailure?.(payload, response.status, response.headers.get('x-correlation-id'));
        return;
      }
      const length = response.headers.get('content-length');
      if (!length || !/^[1-9]\d*$/u.test(length) || !Number.isSafeInteger(Number(length))) {
        failed = true;
        return;
      }
      const file = await response.blob();
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (controller !== attempt) return;
      const header = new TextDecoder('ascii').decode(bytes.subarray(0, 5));
      const tail = new TextDecoder('latin1').decode(
        bytes.subarray(Math.max(0, bytes.length - 1024)),
      );
      if (
        file.size !== Number(length) ||
        bytes.length < 8 ||
        header !== '%PDF-' ||
        !tail.includes('%%EOF')
      ) {
        failed = true;
        return;
      }
      filename = privateDownloadFilename(
        response.headers.get('content-disposition'),
        'document.pdf',
      );
      objectUrl = URL.createObjectURL(new Blob([file], { type: 'application/pdf' }));
      blobUrl = objectUrl;
    } catch {
      if (controller === attempt && !attempt.signal.aborted) failed = true;
    } finally {
      if (controller === attempt) loading = false;
    }
  }
  onMount(() => {
    mounted = true;
    return () => {
      mounted = false;
      clear();
    };
  });
  $effect(() => {
    src;
    if (mounted) void load();
  });
</script>

<section class="actual-pdf-preview no-print" aria-label={copy.title} data-actual-pdf-preview>
  <header>
    <h3>{copy.title}</h3>
    <p>{copy.help}</p>
  </header>
  {#if loading}<p class="preview-status" role="status">{copy.loading}</p>
  {:else if failed}<div class="preview-status" role="alert">
      <p>{copy.failure}</p>
      <button type="button" class="preview-retry" onclick={() => void load()}>{copy.retry}</button>
    </div>
  {:else if blobUrl}
    <iframe src={blobUrl} title={`${copy.title}: ${filename}`} referrerpolicy="no-referrer"
    ></iframe>
    <p class="preview-status">{filename} · {copy.fallback}</p>
  {/if}
</section>

<style>
  .actual-pdf-preview {
    width: 100%;
    min-width: 0;
    border: 1px solid #d9e1e7;
    border-radius: 1rem;
    overflow: hidden;
    margin: 1rem 0;
    background: white;
  }
  header {
    padding: 1rem 1.25rem;
    border-bottom: 1px solid #d9e1e7;
  }
  h3 {
    margin: 0;
    font-size: 1.1rem;
  }
  p {
    margin: 0.5rem 0 0;
    color: #475569;
    line-height: 1.5;
  }
  iframe {
    display: block;
    border: 0;
    width: 100%;
    height: clamp(400px, 72dvh, 900px);
    background: #e9edf1;
  }
  .preview-status {
    padding: 1rem;
    margin: 0;
  }
  .actual-pdf-preview .preview-retry {
    min-height: 44px;
    margin-top: 0.75rem;
    padding: 0.65rem 1rem;
    font: inherit;
    border: 1px solid #94a3b8;
    border-radius: 0.5rem;
    background: white;
    color: #0f2d3d;
    cursor: pointer;
  }
  .actual-pdf-preview .preview-retry:focus-visible {
    outline: 3px solid #e23d2d;
    outline-offset: 3px;
  }
</style>
