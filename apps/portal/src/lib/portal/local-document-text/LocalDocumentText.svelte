<script lang="ts">
  import { base } from '$app/paths';
  let {
    locale = 'en',
    onUse,
    inputId = 'local-document-text',
  }: {
    locale?: 'en' | 'es' | 'pt';
    onUse: (text: string) => void;
    inputId?: string;
  } = $props();
  const words = {
    en: {
      title: 'Read text from a document',
      file: 'Receipt or document (PNG, JPEG, PDF or UTF-8 text; up to 8 MB)',
      extract: 'Extract text locally',
      working: 'Reading…',
      note: 'Processed on this server without an external AI service. Text can be wrong or incomplete. This does not attach the file or verify its contents.',
      result: 'Review and correct extracted text',
      use: 'Use reviewed text',
      used: 'Reviewed text added. Attach the original file through the record’s upload controls.',
      empty:
        'No readable text found. For a scanned PDF, upload a clear image or enter the facts yourself.',
      limited:
        'Preview is limited to 10,000 characters and the first 20 PDF pages. Keep the original as evidence.',
      failed: 'The file could not be read. Try a clearer image or enter the text yourself.',
      unavailable: 'The local reader or selected language is unavailable. Enter the text yourself.',
      busy: 'The local reader is busy. Wait a moment and try again.',
      invalid_file: 'Choose a valid PNG, JPEG, PDF or UTF-8 text file up to 8 MB.',
      sign_in: 'Sign in again before reading this file.',
      access: 'Your session is no longer eligible. Sign in again.',
    },
    es: {
      title: 'Leer texto de un documento',
      file: 'Recibo o documento (PNG, JPEG, PDF o texto UTF-8; hasta 8 MB)',
      extract: 'Extraer texto localmente',
      working: 'Leyendo…',
      note: 'Se procesa en este servidor sin un servicio externo de IA. El texto puede ser erróneo o incompleto. Esto no adjunta el archivo ni verifica su contenido.',
      result: 'Revisa y corrige el texto extraído',
      use: 'Usar texto revisado',
      used: 'Texto revisado añadido. Adjunta el original desde los controles de carga del registro.',
      empty:
        'No se encontró texto legible. Para un PDF escaneado, carga una imagen clara o introduce los datos.',
      limited:
        'La vista previa se limita a 10.000 caracteres y las primeras 20 páginas del PDF. Conserva el original como evidencia.',
      failed: 'No se pudo leer el archivo. Prueba una imagen más clara o escribe el texto.',
      unavailable:
        'El lector local o el idioma no está disponible. Introduce el texto manualmente.',
      busy: 'El lector está ocupado. Espera un momento y vuelve a intentarlo.',
      invalid_file: 'Elige un PNG, JPEG, PDF o texto UTF-8 válido de hasta 8 MB.',
      sign_in: 'Inicia sesión de nuevo para leer el archivo.',
      access: 'La sesión ya no es válida. Inicia sesión de nuevo.',
    },
    pt: {
      title: 'Ler texto de um documento',
      file: 'Comprovativo ou documento (PNG, JPEG, PDF ou texto UTF-8; até 8 MB)',
      extract: 'Extrair texto localmente',
      working: 'A ler…',
      note: 'Processado neste servidor sem um serviço externo de IA. O texto pode estar errado ou incompleto. Isto não anexa o ficheiro nem verifica o conteúdo.',
      result: 'Reveja e corrija o texto extraído',
      use: 'Usar texto revisto',
      used: 'Texto revisto adicionado. Anexe o original através dos controlos de envio do registro.',
      empty:
        'Não foi encontrado texto legível. Para um PDF digitalizado, envie uma imagem clara ou introduza os dados.',
      limited:
        'A prévia limita-se a 10.000 caracteres e às primeiras 20 páginas do PDF. Guarde o original como evidência.',
      failed: 'Não foi possível ler o ficheiro. Tente uma imagem mais nítida ou escreva o texto.',
      unavailable: 'O leitor local ou o idioma não está disponível. Introduza o texto manualmente.',
      busy: 'O leitor está ocupado. Aguarde um momento e tente novamente.',
      invalid_file: 'Selecione um PNG, JPEG, PDF ou texto UTF-8 válido até 8 MB.',
      sign_in: 'Inicie sessão novamente para ler o ficheiro.',
      access: 'A sessão já não é válida. Inicie sessão novamente.',
    },
  };
  let copy = $derived(words[locale]);
  let files = $state<FileList>();
  let busy = $state(false);
  let text = $state('');
  let message = $state('');
  let limited = $state(false);
  async function extract() {
    const file = files?.[0];
    text = '';
    message = '';
    limited = false;
    if (!file || !file.size || file.size > 8 * 1024 * 1024) {
      message = copy.invalid_file;
      return;
    }
    busy = true;
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('locale', locale);
      const response = await fetch(`${base}/app/api/workflow/extract`, {
        method: 'POST',
        body: form,
      });
      const result = await response.json();
      if (!response.ok) {
        message = copy[result.error as keyof typeof copy] ?? copy.failed;
        return;
      }
      text = typeof result.text === 'string' ? result.text.slice(0, 10_000) : '';
      limited = Boolean(result.truncated || result.pageLimit || result.text.length > 10_000);
      if (!text) message = copy.empty;
    } catch {
      message = copy.failed;
    } finally {
      busy = false;
    }
  }
</script>

<details class="local-reader">
  <summary>{copy.title}</summary>
  <p>{copy.note}</p>
  <label for={inputId}>{copy.file}</label>
  <input
    id={inputId}
    type="file"
    accept="image/png,image/jpeg,application/pdf,text/plain"
    bind:files
    disabled={busy}
    onchange={() => {
      text = '';
      message = '';
    }}
  />
  <button type="button" class="button secondary" onclick={extract} disabled={busy}
    >{busy ? copy.working : copy.extract}</button
  >
  <p role="status" aria-live="polite">{message}</p>
  {#if text}
    <label for={`${inputId}-review`}>{copy.result}</label>
    <textarea id={`${inputId}-review`} rows="8" maxlength="10000" bind:value={text}></textarea>
    {#if limited}<p>{copy.limited}</p>{/if}
    <button
      type="button"
      class="button secondary"
      onclick={() => {
        onUse(text);
        message = copy.used;
      }}>{copy.use}</button
    >
  {/if}
</details>

<style>
  .local-reader {
    border: 1px solid var(--border, #cbd5e1);
    border-radius: 0.65rem;
    padding: 1rem;
    margin-block: 1rem;
    min-width: 0;
  }
  summary {
    cursor: pointer;
    font-weight: 600;
    min-height: 44px;
    align-content: center;
  }
  label {
    display: block;
    font-weight: 600;
    margin-block: 0.75rem 0.35rem;
  }
  input,
  textarea {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
  }
  textarea {
    padding: 0.65rem;
    border: 1px solid #94a3b8;
    border-radius: 0.35rem;
  }
  button {
    min-height: 44px;
    margin-top: 0.75rem;
    white-space: normal;
  }
  p {
    overflow-wrap: anywhere;
  }
</style>
