<script lang="ts">
  import { tick } from 'svelte';
  import { base } from '$app/paths';
  type Locale = 'en' | 'es' | 'pt';
  type Tutorial = {
    title: 'Owner tutorial';
    durationSeconds: 5253.7;
    audioLanguage: 'en';
    captionsLanguage: 'en';
    chapters: readonly { id: string; title: string; startSeconds: number }[];
  };
  let { tutorial, locale }: { tutorial: Tutorial; locale: Locale } = $props();
  let playerRequested = $state(false);
  let playerError = $state(false);
  let failureKind = $state<'load' | 'playback'>('load');
  let videoElement = $state<HTMLVideoElement | undefined>();
  let playbackRate = $state(1);
  let pendingSeek = $state<number | null>(null);
  let playerGeneration = $state(0);
  const playbackRates = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

  const copy: Record<Locale, Record<string, string>> = {
    en: {
      title: 'Owner tutorial',
      summary:
        'A fictional training case covering the owner workspace from setup through finance and handoff.',
      duration: '1 hr 28 min',
      chapters: '24 chapters',
      audioCaptions: 'English audio · English captions',
      fictional: 'Fictional training data',
      play: 'Watch Owner tutorial',
      chapterList: 'Chapters',
      playChapter: 'Play chapter',
      fullscreenNote: 'Use fullscreen for the clearest text.',
      playbackSpeed: 'Playback speed',
      normalSpeed: 'Normal',
      loadFailure: 'The tutorial could not be loaded. Check your connection and try again.',
      retry: 'Try again',
      playbackFailure: 'Playback could not start. Use the video controls to try again.',
    },
    es: {
      title: 'Tutorial para el propietario',
      summary:
        'Un caso de formación ficticio que recorre el espacio del propietario desde la configuración hasta las finanzas y la entrega.',
      duration: '1 h 28 min',
      chapters: '24 capítulos',
      audioCaptions: 'Audio en inglés · Subtítulos en inglés',
      fictional: 'Datos ficticios de formación',
      play: 'Ver tutorial del propietario',
      chapterList: 'Capítulos',
      playChapter: 'Reproducir capítulo',
      fullscreenNote: 'Usa la pantalla completa para ver el texto con más claridad.',
      playbackSpeed: 'Velocidad de reproducción',
      normalSpeed: 'Normal',
      loadFailure: 'No se pudo cargar el tutorial. Comprueba la conexión e inténtalo de nuevo.',
      retry: 'Reintentar',
      playbackFailure: 'No se pudo iniciar la reproducción. Vuelve a intentarlo con los controles.',
    },
    pt: {
      title: 'Tutorial do proprietário',
      summary:
        'Um caso fictício de treinamento que percorre o espaço do proprietário, da configuração às finanças e à entrega.',
      duration: '1 h 28 min',
      chapters: '24 capítulos',
      audioCaptions: 'Áudio em inglês · Legendas em inglês',
      fictional: 'Dados fictícios de treinamento',
      play: 'Assistir ao tutorial do proprietário',
      chapterList: 'Capítulos',
      playChapter: 'Reproduzir capítulo',
      fullscreenNote: 'Use a tela cheia para ver o texto com mais nitidez.',
      playbackSpeed: 'Velocidade de reprodução',
      normalSpeed: 'Normal',
      loadFailure: 'Não foi possível carregar o tutorial. Verifique a conexão e tente novamente.',
      retry: 'Tentar novamente',
      playbackFailure: 'A reprodução não iniciou. Tente novamente pelos controles do vídeo.',
    },
  };
  const text = (key: string) => copy[locale][key] ?? copy.en[key] ?? key;
  const assetUrl = (asset: 'video.mp4' | 'captions.vtt' | 'poster.webp') =>
    `${base}/app/api/help/owner-tutorial/${asset}`;
  const playbackRejected = () => {
    failureKind = 'playback';
    playerError = true;
  };

  async function requestPlayback(startSeconds: number): Promise<void> {
    playerError = false;
    failureKind = 'load';
    pendingSeek = startSeconds;
    playerRequested = true;
    await tick();
    if (videoElement) {
      videoElement.defaultPlaybackRate = playbackRate;
      videoElement.playbackRate = playbackRate;
      videoElement.load();
      void videoElement.play().catch(() => {
        playbackRejected();
      });
    }
  }

  function loadedMetadata(): void {
    if (videoElement && pendingSeek !== null) {
      videoElement.currentTime = pendingSeek;
      pendingSeek = null;
    }
  }

  function updatePlaybackRate(event: Event): void {
    const selectedRate = Number((event.currentTarget as HTMLSelectElement).value);
    if (!Number.isFinite(selectedRate) || selectedRate <= 0) return;
    playbackRate = selectedRate;
    if (videoElement) {
      videoElement.defaultPlaybackRate = selectedRate;
      videoElement.playbackRate = selectedRate;
    }
  }

  function synchronizePlaybackRate(): void {
    if (videoElement && Number.isFinite(videoElement.playbackRate)) {
      playbackRate = videoElement.playbackRate;
    }
  }

  async function retryPlayback(): Promise<void> {
    playerError = false;
    failureKind = 'load';
    playerRequested = false;
    pendingSeek = null;
    playerGeneration += 1;
    await tick();
    await requestPlayback(0);
  }

  function jumpToChapter(startSeconds: number): void {
    if (!playerRequested) {
      void requestPlayback(startSeconds);
      return;
    }
    if (videoElement) {
      if (videoElement.readyState < 1) {
        pendingSeek = startSeconds;
        return;
      }
      videoElement.currentTime = startSeconds;
      if (videoElement.paused) {
        void videoElement.play().catch(() => {
          playbackRejected();
        });
      }
    } else {
      pendingSeek = startSeconds;
    }
  }

  function formatTime(seconds: number): string {
    const wholeSeconds = Math.floor(seconds);
    const hours = Math.floor(wholeSeconds / 3600);
    const minutes = Math.floor((wholeSeconds % 3600) / 60);
    const remainingSeconds = wholeSeconds % 60;
    return [hours, minutes, remainingSeconds]
      .map((part) => String(part).padStart(2, '0'))
      .join(':');
  }
</script>

<section
  class="tutorial-card"
  class:tutorial-playing={playerRequested}
  data-owner-tutorial
  aria-labelledby="owner-tutorial-title"
>
  {#if !playerRequested}
    <div class="tutorial-poster">
      <img src={assetUrl('poster.webp')} alt="" width="640" height="360" loading="lazy" />
      <span>{text('fictional')}</span>
    </div>
  {/if}
  <div class="tutorial-content">
    <p class="tutorial-kicker">{text('fictional')}</p>
    <h2 id="owner-tutorial-title">{text('title')}</h2>
    <p class="summary">{text('summary')}</p>
    <p class="details">
      <span>{text('duration')}</span>
      <span>{text('chapters')}</span>
      <span>{text('audioCaptions')}</span>
    </p>
    {#if !playerRequested}
      <button class="play-button" type="button" onclick={() => void requestPlayback(0)}>
        {text('play')}
      </button>
    {:else}
      {#key playerGeneration}
        <video
          bind:this={videoElement}
          controls
          preload="none"
          playsinline
          poster={assetUrl('poster.webp')}
          src={assetUrl('video.mp4')}
          onloadedmetadata={loadedMetadata}
          onratechange={synchronizePlaybackRate}
          onerror={() => {
            failureKind = 'load';
            playerError = true;
          }}
          aria-label={text('title')}
        >
          <track
            kind="captions"
            src={assetUrl('captions.vtt')}
            srclang="en"
            label="English"
            default
          />
        </video>
      {/key}
      <div class="playback-speed">
        <label for="owner-tutorial-playback-speed">{text('playbackSpeed')}</label>
        <select
          id="owner-tutorial-playback-speed"
          value={playbackRate}
          onchange={updatePlaybackRate}
          aria-label={text('playbackSpeed')}
        >
          {#if !playbackRates.includes(playbackRate as (typeof playbackRates)[number])}
            <option value={playbackRate}>{playbackRate}×</option>
          {/if}
          {#each playbackRates as rate}
            <option value={rate}>
              {rate}×{rate === 1 ? ` (${text('normalSpeed')})` : ''}
            </option>
          {/each}
        </select>
      </div>
      <p class="fullscreen-note">{text('fullscreenNote')}</p>
      {#if playerError}
        <div class="player-error" role="alert">
          <p>{text(failureKind === 'playback' ? 'playbackFailure' : 'loadFailure')}</p>
          <button type="button" onclick={() => void retryPlayback()}>{text('retry')}</button>
        </div>
      {/if}
    {/if}

    <details class="chapter-list">
      <summary>{text('chapterList')}</summary>
      <ol>
        {#each tutorial.chapters as chapter, index}
          <li>
            <button
              type="button"
              data-tutorial-chapter={index}
              aria-label={`${text('playChapter')}: ${chapter.title}`}
              onclick={() => jumpToChapter(chapter.startSeconds)}
            >
              <span class="chapter-time">{formatTime(chapter.startSeconds)}</span>
              <span>{chapter.title}</span>
            </button>
          </li>
        {/each}
      </ol>
    </details>
  </div>
</section>

<style>
  .tutorial-card {
    display: grid;
    grid-template-columns: minmax(9rem, 15rem) minmax(0, 1fr);
    gap: 1.1rem;
    align-items: start;
    margin: 1.25rem 0;
    padding: 1rem;
    border: 1px solid #e1e0de;
    border-radius: 0.75rem;
    background: #fff;
    box-shadow: 0 3px 14px rgba(23, 32, 51, 0.05);
  }
  .tutorial-poster {
    position: relative;
    overflow: hidden;
    border-radius: 0.55rem;
    background: #292c31;
  }
  .tutorial-poster img {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
  }
  .tutorial-poster > span {
    position: absolute;
    right: 0.4rem;
    bottom: 0.4rem;
    border-radius: 0.25rem;
    padding: 0.2rem 0.35rem;
    color: white;
    background: rgba(20, 20, 20, 0.8);
    font-size: 0.68rem;
    font-weight: 700;
  }
  .tutorial-content {
    min-width: 0;
  }
  .tutorial-playing {
    grid-template-columns: minmax(0, 1fr);
  }
  .tutorial-kicker {
    margin: 0 0 0.35rem;
    color: #5d5c55;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }
  .tutorial-content h2 {
    margin: 0 0 0.45rem;
    color: #353430;
    font-size: 1.2rem;
  }
  .summary {
    margin: 0 0 0.6rem;
    color: #575650;
    line-height: 1.5;
  }
  .details {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem 0.8rem;
    margin: 0 0 0.75rem;
    color: #67675f;
    font-size: 0.8rem;
  }
  .play-button,
  .player-error button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.75rem;
    border: 1px solid #4e4d47;
    border-radius: 0.45rem;
    padding: 0.55rem 0.8rem;
    color: #fff;
    background: #4e4d47;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  .tutorial-card button:focus-visible,
  .chapter-list summary:focus-visible,
  .playback-speed select:focus-visible {
    outline: 3px solid #f59e0b;
    outline-offset: 2px;
  }
  video {
    display: block;
    width: 100%;
    max-height: min(62vh, 36rem);
    aspect-ratio: 16 / 9;
    border-radius: 0.55rem;
    background: #111;
  }
  .playback-speed {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem 0.65rem;
    margin-top: 0.65rem;
  }
  .playback-speed label {
    color: #45443f;
    font-weight: 600;
  }
  .playback-speed select {
    min-width: 5.5rem;
    min-height: 44px;
    border: 1px solid #8a8982;
    border-radius: 0.4rem;
    padding: 0.45rem 0.6rem;
    color: #353430;
    background: #fff;
    font: inherit;
  }
  .fullscreen-note {
    margin: 0.45rem 0 0;
    color: #67675f;
    font-size: 0.78rem;
  }
  .chapter-list {
    margin-top: 0.8rem;
  }
  .chapter-list summary {
    width: fit-content;
    min-height: 2.5rem;
    display: flex;
    align-items: center;
    color: #45443f;
    font-weight: 700;
    cursor: pointer;
  }
  .chapter-list ol {
    max-height: 20rem;
    overflow-y: auto;
    margin: 0.35rem 0 0;
    padding: 0.25rem;
    list-style: none;
    border: 1px solid #e8e8e6;
    border-radius: 0.5rem;
  }
  .chapter-list li + li {
    border-top: 1px solid #ecebe8;
  }
  .chapter-list li button {
    display: flex;
    gap: 0.65rem;
    align-items: start;
    width: 100%;
    min-height: 2.75rem;
    padding: 0.55rem 0.4rem;
    border: 0;
    border-radius: 0.3rem;
    color: #353430;
    background: transparent;
    text-align: left;
    line-height: 1.4;
    font: inherit;
    cursor: pointer;
  }
  .chapter-list li button:hover {
    background: #f7f7f6;
  }
  .chapter-time {
    flex: none;
    color: #68675f;
    font-variant-numeric: tabular-nums;
    font-size: 0.8rem;
  }
  .player-error {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem 0.75rem;
    margin-top: 0.6rem;
    color: #842f27;
  }
  .player-error p {
    flex-basis: 100%;
    margin: 0;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    clip-path: inset(50%);
  }
  @media (max-width: 560px) {
    .tutorial-card {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.75rem;
      padding: 0.85rem;
    }
    .tutorial-poster {
      max-width: 18rem;
    }
  }
</style>
