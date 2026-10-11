<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    prepareLocalDictation,
    type LocalRecognition,
    type RecognitionConstructor,
  } from './local-dictation';
  let { locale = 'en', onText }: { locale?: 'en' | 'es' | 'pt'; onText: (text: string) => void } =
    $props();
  const words = {
    en: {
      start: 'Dictate on this device',
      stop: 'Stop dictation',
      checking: 'Checking local speech…',
      listening: 'Listening on this device…',
      note: 'Uses an already installed on-device speech pack, when supported. Review the transcribed words. No cloud fallback.',
      unavailable:
        'Local dictation is unavailable for this browser or language. Please type your notes.',
      error: 'Dictation stopped. Check microphone permission or type your notes.',
      done: 'Dictation stopped. Review the words added to your notes.',
    },
    es: {
      start: 'Dictar en este dispositivo',
      stop: 'Detener dictado',
      checking: 'Comprobando voz local…',
      listening: 'Escuchando en este dispositivo…',
      note: 'Usa un paquete de voz ya instalado en el dispositivo, si es compatible. Revisa el texto transcrito. Sin alternativa en la nube.',
      unavailable:
        'El dictado local no está disponible para este navegador o idioma. Escribe tus notas.',
      error: 'Dictado detenido. Revisa el permiso del micrófono o escribe tus notas.',
      done: 'Dictado detenido. Revisa las palabras añadidas a tus notas.',
    },
    pt: {
      start: 'Ditar neste dispositivo',
      stop: 'Parar ditado',
      checking: 'A verificar voz local…',
      listening: 'A ouvir neste dispositivo…',
      note: 'Usa um pacote de voz já instalado no dispositivo, quando compatível. Reveja as palavras transcritas. Sem alternativa na nuvem.',
      unavailable:
        'O ditado local não está disponível neste navegador ou idioma. Escreva as suas notas.',
      error: 'Ditado parado. Verifique a permissão do microfone ou escreva as notas.',
      done: 'Ditado parado. Reveja as palavras adicionadas às notas.',
    },
  };
  let copy = $derived(words[locale]);
  let busy = $state(false),
    listening = $state(false),
    message = $state('');
  let recognition: LocalRecognition | null = null;
  let disposed = false;
  let stopTimer: ReturnType<typeof setTimeout> | undefined;
  function stop() {
    recognition?.stop();
    listening = false;
    clearTimeout(stopTimer);
  }
  async function start() {
    busy = true;
    message = copy.checking;
    try {
      const browser = window as unknown as {
        SpeechRecognition?: RecognitionConstructor;
        webkitSpeechRecognition?: RecognitionConstructor;
      };
      const local = await prepareLocalDictation(
        browser.SpeechRecognition ?? browser.webkitSpeechRecognition,
        { en: 'en-US', es: 'es-ES', pt: 'pt-PT' }[locale],
      );
      if (disposed) return;
      if (!local) {
        message = copy.unavailable;
        return;
      }
      recognition = local;
      local.onresult = (event) => {
        const text = Array.from(event.results)
          .slice(event.resultIndex)
          .filter((result) => result.isFinal)
          .map((result) => result[0]?.transcript ?? '')
          .join(' ')
          .trim();
        if (text) onText(text.slice(0, 5000));
      };
      local.onerror = () => {
        message = copy.error;
        listening = false;
        clearTimeout(stopTimer);
      };
      local.onend = () => {
        listening = false;
        clearTimeout(stopTimer);
        if (message !== copy.error) message = copy.done;
      };
      local.start();
      listening = true;
      message = copy.listening;
      stopTimer = setTimeout(stop, 60_000);
    } catch {
      message = copy.error;
      listening = false;
    } finally {
      busy = false;
    }
  }
  onDestroy(() => {
    disposed = true;
    clearTimeout(stopTimer);
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
    }
  });
</script>

<div class="local-dictation">
  <button
    type="button"
    class="button secondary"
    disabled={busy}
    onclick={() => (listening ? stop() : start())}>{listening ? copy.stop : copy.start}</button
  >
  <p>{copy.note}</p>
  <p role="status" aria-live="polite">{message}</p>
</div>

<style>
  button {
    min-height: 44px;
    white-space: normal;
  }
  p {
    font-size: 0.875rem;
    overflow-wrap: anywhere;
    margin-block: 0.5rem;
  }
</style>
