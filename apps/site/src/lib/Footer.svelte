<script lang="ts">
  import { base } from '$app/paths';
  import type { Locale } from '@ja/i18n';
  import type { Copy } from './content';
  let { locale, content }: { locale: Locale; content: Copy } = $props();
</script>

<footer>
  <div class="footer-grid shell">
    <div>
      <img
        src={`${base}/brand/logo-jaautomation.png`}
        alt="J&A Automation"
        width="190"
        height="56"
      />
      <p>
        Industrial automation, controls engineering, robotics, commissioning and technical support.
      </p>
    </div>
    <div>
      <span class="mono">NAVIGATION</span>{#each Object.entries(content.nav) as [path, label]}<a
          href={`${base}/${locale}/${path === 'aquarex' ? 'solutions/aquarex' : path}/`}>{label}</a
        >{/each}
    </div>
    <div>
      <span class="mono">CONTACT</span><a href={`${base}/${locale}/contact/`}>{content.talk}</a><a
        href={`${base}/${locale}/contact/?mode=support`}>{content.support}</a
      ><a href={`${base}/app/`}>{content.portal}</a>
    </div>
  </div>
  <div class="footer-bottom shell">
    <span>© {new Date().getFullYear()} J&A Automation LLC</span><span
      ><a href={`${base}/${locale}/privacy/`}>Privacy</a> /
      <a href={`${base}/${locale}/terms/`}>Terms</a></span
    ><span>United States + Brazil operations</span>
  </div>
</footer>
