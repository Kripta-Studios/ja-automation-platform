<script lang="ts">
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import { browserForgetIdentity } from '$lib/portal/offline-controller';
  import PortalChrome from '$lib/PortalChrome.svelte';
  import { portalNavigationForRole, type NavItem } from '$lib/portal-navigation';
  import { portalText, normalizePortalLocale } from '$lib/portal-i18n';
  import { initials } from '$lib/portal/portal-format';
  import { persistStandaloneLocale, applyStandaloneDocumentLocale } from '../standalone-locale';
  let { data, children } = $props();
  let menuOpen = $state(false);
  let online = $state(true);
  const locale = $derived(normalizePortalLocale(data.locale));
  const translate = (text: string) => portalText(locale, text);
  const navigation = $derived(
    portalNavigationForRole(base, data.managementUser.role, data.managementUser.workforceProfile),
  );
  const chromeData = $derived({ section: 'manage', user: data.managementUser });
  const owner = $derived(data.managementUser.role === 'owner_admin');
  const itemHref = (item: NavItem) => {
    const href = item.href ?? `${base}/app/${item.section === 'today' ? '' : item.section}`;
    return `${href}${href.includes('?') ? '&' : '?'}lang=${locale}`;
  };
  function changeLocale(event: Event) {
    const next = normalizePortalLocale((event.currentTarget as HTMLSelectElement).value);
    persistStandaloneLocale(next);
    const url = new URL(location.href);
    url.searchParams.set('lang', next);
    location.assign(url);
  }
  async function logout() {
    await browserForgetIdentity(data.managementUser.id);
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
</div>
