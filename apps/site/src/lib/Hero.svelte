<script lang="ts">
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import type { Copy } from './content';

  let { content }: { content: Copy } = $props();
  const frames = [
    { src: '/images/hero/hero-robotics.jpg', label: '01 / AUTOMOTIVE + ROBOTICS' },
    { src: '/images/hero/hero-food-beverage.jpg', label: '02 / FOOD + BEVERAGE' },
    { src: '/images/hero/hero-energy-process.jpg', label: '03 / ENERGY + PROCESS' },
  ];
  let active = $state(0);
  let paused = $state(false);
  let reduced = $state(true);

  onMount(() => {
    reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    const timer = window.setInterval(() => {
      if (!paused && document.visibilityState === 'visible') active = (active + 1) % frames.length;
    }, 6500);
    return () => clearInterval(timer);
  });
</script>

<section
  class="hero"
  aria-labelledby="hero-title"
  onmouseenter={() => (paused = true)}
  onmouseleave={() => (paused = false)}
>
  <div class="hero-media" aria-hidden="true">
    {#each frames as frame, index}
      <img
        class:active={index === active}
        src={`${base}${frame.src}`}
        alt=""
        width="1900"
        height="900"
        fetchpriority={index === 0 ? 'high' : 'auto'}
        loading={index === 0 ? 'eager' : 'lazy'}
      />
    {/each}
  </div>
  <div class="hero-shade"></div>
  <div class="hero-grid shell">
    <div class="hero-copy">
      <p class="eyebrow light">{content.hero.eyebrow}</p>
      <h1 id="hero-title">{content.hero.title}</h1>
      <p class="hero-lead">{content.hero.body}</p>
      <div class="actions">
        <a class="button red" href="#contact">{content.talk}<span aria-hidden="true">↗</span></a>
        <a class="text-link light" href="#capabilities"
          >{content.nav.capabilities} <span aria-hidden="true">→</span></a
        >
      </div>
    </div>
    <div class="hero-index">
      <span class="mono">SECTOR ROTATION</span>
      <strong>{frames[active]?.label}</strong>
      <div class="frame-controls">
        {#each frames as _, index}
          <button
            class:active={index === active}
            aria-label={`Show sector ${index + 1}`}
            aria-pressed={index === active}
            onclick={() => (active = index)}>{String(index + 1).padStart(2, '0')}</button
          >
        {/each}
        {#if !reduced}<button
            class="pause"
            aria-label={paused ? 'Resume image rotation' : 'Pause image rotation'}
            onclick={() => (paused = !paused)}>{paused ? '▶' : 'Ⅱ'}</button
          >{/if}
      </div>
    </div>
  </div>
</section>
