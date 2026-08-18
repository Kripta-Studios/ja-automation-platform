<script lang="ts">
  import { base } from '$app/paths';
  import type { Locale } from '@ja/i18n';
  import type { Copy } from './content';
  let { locale, content }: { locale: Locale; content: Copy } = $props();
  const href = (path = '') => `${base}/${locale}/${path}`;
</script>

<a class="skip" href="#main">Skip to main content</a>
<header class="site-header">
  <a class="brand" href={href()} aria-label="J&A Automation home">
    <img src={`${base}/brand/logo-jaautomation.png`} alt="J&A Automation" width="180" height="52" />
  </a>
  <nav class="desktop-nav" aria-label="Primary navigation">
    {#each Object.entries(content.nav) as [path, label]}
      <a href={href(path === 'aquarex' ? 'solutions/aquarex/' : `${path}/`)}>{label}</a>
    {/each}
  </nav>
  <div class="header-actions">
    <div class="locale" aria-label="Language">
      {#each ['en', 'pt', 'es'] as item}<a
          class:active={item === locale}
          hreflang={item}
          href={`${base}/${item}/`}>{item.toUpperCase()}</a
        >{/each}
    </div>
    <a class="portal-link" href={`${base}/app/`}>{content.portal} ↗</a>
    <a class="button small red" href={href('contact/')}>{content.talk}</a>
  </div>
  <details class="mobile-nav">
    <summary aria-label="Open navigation"><span></span><span></span><span></span></summary>
    <nav aria-label="Mobile navigation">
      {#each Object.entries(content.nav) as [path, label]}<a
          href={href(path === 'aquarex' ? 'solutions/aquarex/' : `${path}/`)}>{label}</a
        >{/each}
      <a href={`${base}/app/`}>{content.portal} ↗</a>
      <a href={href('contact/')}>{content.talk}</a>
      <a href={href('contact/?mode=support')}>{content.support}</a>
      <div class="locale">
        {#each ['en', 'pt', 'es'] as item}<a
            class:active={item === locale}
            href={`${base}/${item}/`}>{item.toUpperCase()}</a
          >{/each}
      </div>
    </nav>
  </details>
</header>
