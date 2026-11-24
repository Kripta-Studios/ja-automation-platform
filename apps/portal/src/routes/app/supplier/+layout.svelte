<script lang="ts">
  import PortalNavIcon from '$lib/PortalNavIcon.svelte';
  import { navIconPath } from '$lib/portal/nav-icons';
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import { browserForgetIdentity } from '$lib/portal/offline-controller';
  import PortalChrome from '$lib/PortalChrome.svelte';
  import { page } from '$app/state';
  import {
    activeNavItem,
    mobilePrimaryNavigationFor,
    portalNavigationForRole,
    type NavItem,
  } from '$lib/portal-navigation';
  import { portalText, normalizePortalLocale } from '$lib/portal-i18n';
  import { initials } from '$lib/portal/portal-format';
  import { persistStandaloneLocale, applyStandaloneDocumentLocale } from '../standalone-locale';
  let { data, children } = $props();
  let menuOpen = $state(false);
  let online = $state(true);
  const locale = $derived(normalizePortalLocale(data.locale));
  const translate = (text: string) => portalText(locale, text);
  const navigation = $derived(
    portalNavigationForRole(base, data.supplierUser.role, data.supplierUser.workforceProfile),
  );
  const itemHref = (item: NavItem) => {
    const href = item.href ?? `${base}/app/${item.section === 'today' ? '' : item.section}`;
    return `${href}${href.includes('?') ? '&' : '?'}lang=${locale}`;
  };
  const chromeData = $derived({ section: 'supplier', user: data.supplierUser });
  // Phone bottom bar (P7): the same compact navigation as the rest of the portal.
  const mobileNavigation = $derived(mobilePrimaryNavigationFor(navigation));
  const activeDestination = $derived(
    activeNavItem([...navigation.primary, ...navigation.secondary], {
      base,
      section: 'supplier',
      url: page.url,
      role: data.supplierUser.role,
      itemHref,
    }),
  );
  const owner = $derived(data.supplierUser.role === 'owner_admin');
  function changeLocale(event: Event) {
    const next = normalizePortalLocale((event.currentTarget as HTMLSelectElement).value);
    persistStandaloneLocale(next);
    const url = new URL(location.href);
    url.searchParams.set('lang', next);
    location.assign(url);
  }
  async function logout() {
    await browserForgetIdentity(data.supplierUser.id);
    const response = await fetch(`${base}/app/api/auth/sign-out`, { method: 'POST' });
    if (response.ok) location.assign(`${base}/app/login`);
  }
  onMount(() => {
    const update = () => {
      online = navigator.onLine;
    };
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  });
  $effect(() => applyStandaloneDocumentLocale(locale));
</script>

<a class="skip-link" href="#portal-main">{translate('Skip to main content')}</a>
<div class="portal-layout">
  <PortalChrome
    {base}
    data={chromeData}
    navigation={navigation.primary}
    secondaryNavigation={navigation.secondary}
    visibleAdmin={navigation.admin}
    securityAdmin={navigation.security}
    showAdmin={owner}
    isManager={owner}
    isFinance={owner}
    canAudit={owner}
    {menuOpen}
    {online}
    queue={0}
    syncMessage=""
    {locale}
    {translate}
    {itemHref}
    {initials}
    {logout}
    {changeLocale}
    onMenuToggle={() => (menuOpen = !menuOpen)}
    onCloseMenu={() => (menuOpen = false)}
  />
  <main id="portal-main" lang={locale}>{@render children()}</main>
  <nav class="bottom-nav" aria-label={translate('Mobile navigation')}>
    {#each mobileNavigation as item}
      <a
        class:active={activeDestination === item}
        href={itemHref(item)}
        aria-current={activeDestination === item ? 'page' : undefined}
        ><span class="bottom-nav-icon" aria-hidden="true"
          ><PortalNavIcon path={navIconPath(item.label)} /></span
        ><span class="bottom-nav-label">{translate(item.shortLabel ?? item.label)}</span></a
      >
    {/each}
    <button
      type="button"
      class="bottom-nav-more"
      aria-controls="portal-navigation"
      aria-expanded={menuOpen}
      onclick={() => (menuOpen = true)}
      class:active={Boolean(activeDestination) && !mobileNavigation.includes(activeDestination!)}
    >
      <span class="bottom-nav-icon" aria-hidden="true"
        ><PortalNavIcon path="M5 12h.01M12 12h.01M19 12h.01" /></span
      >
      <span class="bottom-nav-label">{translate('More')}</span>
    </button>
  </nav>
</div>

<style>
  .bottom-nav-label {
    display: block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bottom-nav-more {
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    font-size: 0.7rem;
  }
</style>
