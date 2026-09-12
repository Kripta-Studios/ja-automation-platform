<script lang="ts">
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import { beforeNavigate, afterNavigate, goto } from '$app/navigation';
  import { createAuthClient } from 'better-auth/client';
  import PortalChrome from '$lib/PortalChrome.svelte';
  import { portalNavigationForRole, type NavItem } from '$lib/portal-navigation';
  import { portalText, type PortalLocale } from '$lib/portal-i18n';
  let { data, children } = $props();
  let menuOpen = $state(false);
  const section = $derived(
    $page.url.pathname.slice(`${base}/app/`.length).split('/')[0] || 'today',
  );
  const locale = $derived((data.locale ?? 'en') as PortalLocale);
  const navigation = $derived(
    portalNavigationForRole(base, data.chromeUser?.role, data.chromeUser?.workforceProfile),
  );
  // Supplier and management routes already provide their own role-aware chrome
  // through nested layouts. Wrapping them here would duplicate the sidebar and
  // confuse assistive navigation landmarks.
  const standalone = $derived(
    Boolean(data.chromeUser) &&
      !['/app/[section]', '/app', '/app/manage'].includes($page.route.id ?? '') &&
      !/\/app\/(supplier|login|invite|accept-invitation)(\/|$)/.test($page.url.pathname),
  );
  const translate = (text: string) => portalText(locale, text);
  const itemHref = (item: NavItem) =>
    item.href ?? `${base}/app/${item.section === 'today' ? '' : item.section}`;
  const auth = createAuthClient({
    baseURL: typeof window === 'undefined' ? undefined : window.location.origin,
    basePath: `${base}/app/api/auth`,
  });
  async function logout() {
    await auth.signOut();
    await goto(`${base}/app/login`);
  }
  function changeLocale(event: Event) {
    const url = new URL($page.url);
    url.searchParams.set('lang', (event.target as HTMLSelectElement).value);
    void goto(url.pathname + url.search + url.hash, { keepFocus: true, noScroll: true });
  }
  // SvelteKit restores scroll on popstate. Keep the actual origin so a detail's Back
  // uses browser history and retains the originating queue's URL and saved UI state.
  let origin = $state<string | null>(null);
  beforeNavigate(({ from, to, type }) => {
    if (
      type !== 'popstate' &&
      from &&
      to &&
      from.url.origin === to.url.origin &&
      from.url.pathname !== to.url.pathname
    )
      origin = from.url.pathname + from.url.search + from.url.hash;
  });
  afterNavigate(() => {
    menuOpen = false;
  });
  function back(event: MouseEvent) {
    if (origin) {
      event.preventDefault();
      origin = null;
      history.back();
    }
  }
  function restoreOriginBack(node: HTMLElement) {
    const click = (event: MouseEvent) => {
      if (
        !origin ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = (event.target as Element).closest('a');
      if (!anchor || !node.contains(anchor) || !/^←/.test(anchor.textContent?.trim() ?? '')) return;
      // Older detail headers still carry a section fallback. Use the actual
      // navigation origin for those links as well as the shared header.
      event.preventDefault();
      event.stopImmediatePropagation();
      origin = null;
      history.back();
    };
    node.addEventListener('click', click, true);
    return {
      destroy() {
        node.removeEventListener('click', click, true);
      },
    };
  }
</script>

{#if standalone && data.chromeUser}
  <a class="skip-link" href="#portal-main">{translate('Skip to main content')}</a>
  <div class="portal-layout standalone-workspace">
    <PortalChrome
      {base}
      data={{ section, user: data.chromeUser }}
      navigation={navigation.primary}
      secondaryNavigation={navigation.secondary}
      visibleAdmin={navigation.admin}
      securityAdmin={navigation.security}
      showAdmin={navigation.admin.length > 0}
      isManager={data.chromeUser.role === 'project_manager'}
      isFinance={['owner_admin', 'finance_admin'].includes(data.chromeUser.role ?? '')}
      canAudit={navigation.security.length > 0}
      {menuOpen}
      online={true}
      queue={0}
      syncMessage=""
      {locale}
      {translate}
      {itemHref}
      initials={(name) =>
        name
          .split(' ')
          .map((part) => part[0])
          .slice(0, 2)
          .join('')}
      {logout}
      {changeLocale}
      onMenuToggle={() => (menuOpen = !menuOpen)}
      onCloseMenu={() => (menuOpen = false)}
    />
    <div id="portal-main" class="standalone-workspace__content" use:restoreOriginBack>
      <a class="workspace-back" href={origin ?? `${base}/app/${section}`} onclick={back}
        >← {translate('Back')}</a
      >
      {@render children()}
    </div>
  </div>
{:else}
  {@render children()}
{/if}
