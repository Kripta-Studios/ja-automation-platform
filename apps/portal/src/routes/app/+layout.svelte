<script lang="ts">
  import PortalNavIcon from '$lib/PortalNavIcon.svelte';
  import { navIconPath } from '$lib/portal/nav-icons';
  import { rememberUrlView } from '$lib/portal/ui/url-view-preferences.svelte';
  import DirectionIcon from '$lib/portal/ui/DirectionIcon.svelte';
  import NavigationAssistant from '$lib/portal/assistant/NavigationAssistant.svelte';
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import { beforeNavigate, afterNavigate, goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import {
    installWorkspaceNavigation,
    configureWorkspaceNavigation,
    cancelWorkspaceNavigation,
    restoreWorkspaceNavigation,
  } from '$lib/portal/ui/workspace-navigation';
  import { createAuthClient } from 'better-auth/client';
  import PortalChrome from '$lib/PortalChrome.svelte';
  import {
    activeNavItem,
    mobilePrimaryNavigationFor,
    portalNavigationForRole,
    type NavItem,
  } from '$lib/portal-navigation';
  import { portalText, type PortalLocale } from '$lib/portal-i18n';
  let { data, children } = $props();
  configureWorkspaceNavigation(
    () => (data.chromeUser ? `${data.chromeUser.id}:${data.chromeUser.role}` : ''),
    () => $page.form?.success === false || Boolean($page.form?.fieldErrors || $page.form?.problem),
  );
  rememberUrlView(
    () => (data.chromeUser ? `${data.chromeUser.id}:${data.chromeUser.role}` : ''),
    base,
  );
  let menuOpen = $state(false);
  // An action posted after the session expired or was revoked comes back as a
  // typed 401 failure (see hooks.server.ts). The page keeps the typed values;
  // offer sign-in in a new tab so nothing on this page is lost.
  let dismissedSessionProblem = $state('');
  const sessionProblem = $derived(
    ($page.form as { code?: string; correlationId?: string } | null)?.code ===
      'AUTH_SESSION_EXPIRED'
      ? String(($page.form as { correlationId?: string }).correlationId ?? 'expired')
      : '',
  );
  const section = $derived(
    $page.url.pathname.slice(`${base}/app/`.length).split('/')[0] || 'today',
  );
  const locale = $derived((data.locale ?? 'en') as PortalLocale);
  const navigation = $derived(
    portalNavigationForRole(base, data.chromeUser?.role, data.chromeUser?.workforceProfile, {
      crewChief: data.crewChief === true,
    }),
  );
  // Supplier and management routes already provide their own role-aware chrome
  // through nested layouts. Wrapping them here would duplicate the sidebar and
  // confuse assistive navigation landmarks.
  // T18: an error replaces the page that would have drawn its own chrome, so
  // error pages (403/404) always get this shell and the person keeps the menu.
  const standalone = $derived(
    Boolean(data.chromeUser) &&
      !/\/app\/(login|invite|accept-invitation)(\/|$)/.test($page.url.pathname) &&
      (Boolean($page.error) ||
        (!['/app/[section]', '/app', '/app/manage'].includes($page.route.id ?? '') &&
          // T30: every /app/manage/* page (e.g. Worker pay review) gets its chrome
          // from the manage layout; wrapping it here rendered the shell twice.
          !($page.route.id ?? '').startsWith('/app/manage/') &&
          !/\/app\/supplier(\/|$)/.test($page.url.pathname))),
  );
  const translate = (text: string) => portalText(locale, text);
  // Y6: standalone pages (project detail, crew, …) keep the phone bottom bar.
  const mobileNavigation = $derived(mobilePrimaryNavigationFor(navigation));
  const activeDestination = $derived(
    activeNavItem([...navigation.primary, ...navigation.secondary], {
      base,
      section,
      url: $page.url,
      role: data.chromeUser?.role,
      itemHref: (item: NavItem) =>
        item.href ?? `${base}/app/${item.section === 'today' ? '' : item.section}`,
    }),
  );
  // Pages with their own breadcrumb back link do not get a second "← Back".
  const ownBackLink = $derived($page.route.id === '/app/projects/[id]');
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
    const select = event.currentTarget as HTMLSelectElement;
    const requestedLocale = select.value;
    select.value = locale;
    const url = new URL($page.url);
    url.searchParams.set('lang', requestedLocale);
    void goto(url.pathname + url.search + url.hash, { keepFocus: true, noScroll: true });
  }
  // SvelteKit restores scroll on popstate. Keep the actual origin so a detail's Back
  // uses browser history and retains the originating queue's URL and saved UI state.
  let origin = $state<string | null>(null);
  let originHasNativeHistory = $state(false);
  let fallbackBackInProgress = false;
  const returnKey = (url: URL) => `ja:return-to:${url.pathname}${url.search}`;
  function rememberOrigin(destination: URL, source: URL): void {
    try {
      sessionStorage.setItem(
        returnKey(destination),
        JSON.stringify({ href: source.pathname + source.search + source.hash, at: Date.now() }),
      );
    } catch {
      // Browser storage is an enhancement. Native history remains authoritative.
    }
  }
  function rememberedOrigin(current: URL): string | null {
    try {
      const raw = sessionStorage.getItem(returnKey(current));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { href?: unknown; at?: unknown };
      if (
        typeof parsed.href !== 'string' ||
        !parsed.href.startsWith(`${base}/app`) ||
        typeof parsed.at !== 'number' ||
        Date.now() - parsed.at > 2 * 60 * 60 * 1000
      ) {
        sessionStorage.removeItem(returnKey(current));
        return null;
      }
      return parsed.href;
    } catch {
      return null;
    }
  }
  beforeNavigate(({ from, to, type }) => {
    cancelWorkspaceNavigation();
    if (
      !fallbackBackInProgress &&
      type !== 'popstate' &&
      from &&
      to &&
      from.url.origin === to.url.origin &&
      from.url.pathname !== to.url.pathname
    ) {
      origin = from.url.pathname + from.url.search + from.url.hash;
      originHasNativeHistory = true;
      rememberOrigin(to.url, from.url);
    }
  });
  afterNavigate(({ to, type }) => {
    menuOpen = false;
    if (!origin && to?.url) {
      origin = rememberedOrigin(to.url);
      originHasNativeHistory = false;
    }
    if (to?.url) restoreWorkspaceNavigation(to.url, type === 'popstate');
  });
  onMount(() => {
    if (!origin) {
      origin = rememberedOrigin($page.url);
      originHasNativeHistory = false;
    }
    return installWorkspaceNavigation();
  });
  function navigateToOrigin(): void {
    if (!origin) return;
    const target = origin;
    const useNativeHistory = originHasNativeHistory && history.length > 1;
    origin = null;
    originHasNativeHistory = false;
    if (useNativeHistory) {
      history.back();
      return;
    }
    fallbackBackInProgress = true;
    void goto(target).finally(() => {
      fallbackBackInProgress = false;
    });
  }
  function back(event: MouseEvent) {
    if (!origin) return;
    event.preventDefault();
    navigateToOrigin();
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
      if (!anchor || !node.contains(anchor) || !anchor.hasAttribute('data-origin-back')) return;
      // Older detail headers still carry a section fallback. Use the actual
      // navigation origin for those links as well as the shared header.
      event.preventDefault();
      event.stopImmediatePropagation();
      navigateToOrigin();
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
      data={{ section, user: data.chromeUser, crewChief: data.crewChief === true }}
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
      badges={{
        approvals: Number(data.approvalPendingCount ?? 0),
        notifications: Number(data.unreadNotificationCount ?? 0),
      }}
    />
    <div id="portal-main" class="standalone-workspace__content" use:restoreOriginBack>
      {#if !ownBackLink}
        <a
          class="workspace-back"
          href={origin ?? `${base}/app/${section}`}
          data-origin-back
          onclick={back}><DirectionIcon direction="left" /> {translate('Back')}</a
        >
      {/if}
      {@render children()}
    </div>
    <nav class="bottom-nav" aria-label={translate('Mobile navigation')}>
      {#each mobileNavigation as item}
        {@const pending = item.section === 'approvals' ? Number(data.approvalPendingCount ?? 0) : 0}
        <a
          class:active={activeDestination === item}
          href={itemHref(item)}
          aria-current={activeDestination === item ? 'page' : undefined}
          aria-label={pending > 0
            ? `${translate(item.label)} · ${pending} ${translate('pending')}`
            : undefined}
          ><span class="bottom-nav-icon" aria-hidden="true"
            ><PortalNavIcon path={navIconPath(item.label)} /></span
          ><span class="bottom-nav-label">{translate(item.shortLabel ?? item.label)}</span
          >{#if pending > 0}<span class="bottom-nav-badge" aria-hidden="true"
              >{pending > 99 ? '99+' : pending}</span
            >{/if}</a
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
{:else}
  {@render children()}
{/if}

{#if sessionProblem && sessionProblem !== dismissedSessionProblem}
  <div class="session-expired" role="alert" data-testid="session-expired">
    <p>
      <strong>{translate('problem.session.expired')}</strong>
      <span>{translate('After signing in, come back to this tab and save again.')}</span>
    </p>
    <div class="session-expired__actions">
      <a
        class="session-expired__signin"
        href={`${base}/app/login?reason=session-expired&lang=${locale}`}
        target="_blank"
        rel="noopener">{translate('Sign in again (new tab)')}</a
      >
      <button
        type="button"
        class="session-expired__close"
        aria-label={translate('Close message')}
        onclick={() => (dismissedSessionProblem = sessionProblem)}>×</button
      >
    </div>
  </div>
{/if}

{#if data.chromeUser && !/\/app\/(login|invite|accept-invitation|enrollment)(\/|$)/.test($page.url.pathname)}
  <NavigationAssistant
    context={{
      role: data.chromeUser.role,
      workforceProfile: data.chromeUser.workforceProfile,
      canonicalOwner: data.chromeUser.canonicalOwner === true,
      crewChief: data.crewChief === true,
    }}
    {locale}
    data={$page.data}
  />
{/if}

<style>
  .session-expired {
    position: fixed;
    z-index: 1000;
    inset: auto 1rem calc(5.5rem + env(safe-area-inset-bottom, 0px)) 1rem;
    max-width: 40rem;
    margin: 0 auto;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 1rem;
    padding: 0.9rem 1rem;
    border: 2px solid #b45309;
    border-radius: 0.75rem;
    background: #fffbeb;
    color: #451a03;
    box-shadow: 0 12px 32px rgb(0 0 0 / 0.18);
  }
  .session-expired p {
    flex: 1 1 16rem;
    margin: 0;
    display: grid;
    gap: 0.25rem;
  }
  .session-expired__actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .session-expired__signin {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 1rem;
    border-radius: 0.5rem;
    background: #92400e;
    color: #fff;
    font-weight: 700;
    text-decoration: none;
  }
  .session-expired__close {
    min-width: 44px;
    min-height: 44px;
    border: 0;
    background: transparent;
    color: inherit;
    font-size: 1.5rem;
    cursor: pointer;
  }
  .bottom-nav-label {
    display: block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bottom-nav a,
  .bottom-nav-more {
    position: relative;
  }
  .bottom-nav-badge {
    position: absolute;
    top: 0.35rem;
    left: calc(50% + 0.9rem);
    min-width: 1.25rem;
    width: max-content;
    padding: 0.05rem 0.3rem;
    border-radius: 999px;
    white-space: nowrap;
    background: var(--ja-red, #b42318);
    color: #fff;
    font-size: 0.6875rem;
    font-weight: 700;
    line-height: 1.3;
    text-align: center;
  }
  .bottom-nav-more {
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    font-size: 0.7rem;
  }
  .bottom-nav-more.active {
    color: var(--ja-ink);
    border-top-color: var(--ja-red);
    background: var(--ja-canvas);
  }
  @media (max-width: 620px) {
    /* Room for the fixed bottom bar (Y6). */
    :global(.standalone-workspace__content) {
      padding-bottom: 5.65rem;
    }
  }
  @media print {
    .bottom-nav {
      display: none;
    }
  }
  @media (min-width: 900px) {
    .session-expired {
      inset: auto 1.5rem 1.5rem auto;
    }
  }
</style>
