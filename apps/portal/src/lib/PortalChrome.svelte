<script lang="ts">
  import DirectionIcon from './portal/ui/DirectionIcon.svelte';
  import { onMount, tick } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { page } from '$app/stores';
  import { portalLocales, type PortalLocale } from './portal-i18n';
  import { translateControlledValue } from './i18n/controlled-values';
  import {
    accountNavigationFor,
    activeNavItem,
    moreNavigationGroups,
    navigationShortcutsFor,
    portalGlobalNavigationForRole,
    subsectionsForNavItem,
    type NavItem,
  } from './portal-navigation';
  import SectionNavigator from './portal/ui/SectionNavigator.svelte';
  import { workspaceRecordSearchHref } from './portal/ui/section-search';
  import PortalNavIcon from './PortalNavIcon.svelte';
  import { navIconPath, navIconPaths } from './portal/nav-icons';
  import { personDisplayName } from './portal/display-name';
  import type { PaletteRecord } from './portal/ui/section-search';

  type ChromeData = {
    section: string;
    canonicalOwner?: boolean;
    user: {
      name: string;
      role?: string;
      workforceProfile?: string;
      canonicalOwner?: boolean;
    };
  };

  let {
    base,
    data,
    navigation,
    secondaryNavigation,
    visibleAdmin,
    securityAdmin,
    showAdmin,
    isManager,
    isFinance,
    canAudit,
    menuOpen,
    online,
    queue,
    syncMessage,
    locale,
    translate,
    itemHref,
    initials,
    logout,
    changeLocale,
    onMenuToggle,
    onCloseMenu,
    badges = {},
    recordSuggestions = [],
    mapRecord,
  }: {
    base: string;
    data: ChromeData;
    navigation: readonly NavItem[];
    secondaryNavigation: readonly NavItem[];
    visibleAdmin: readonly NavItem[];
    securityAdmin: readonly NavItem[];
    showAdmin: boolean;
    isManager: boolean;
    isFinance: boolean;
    canAudit: boolean;
    menuOpen: boolean;
    online: boolean;
    queue: number;
    syncMessage: string;
    locale: PortalLocale;
    translate: (value: string) => string;
    itemHref: (item: NavItem) => string;
    initials: (name: string) => string;
    logout: () => Promise<void>;
    changeLocale: (event: Event) => void;
    onMenuToggle: () => void;
    onCloseMenu: () => void;
    /** Real pending counts keyed by section, e.g. `{ approvals: 12 }`. */
    badges?: Readonly<Record<string, number>>;
    /** Already-authorized record suggestions offered by the search palette. */
    recordSuggestions?: readonly PaletteRecord[];
    mapRecord?: (row: Record<string, unknown>, index: number) => PaletteRecord;
  } = $props();

  let accountOpen = $state(false);
  let moreOpen = $state(false);
  const moreOpenKey = 'ja-portal-nav-more-open';
  const displayName = $derived(personDisplayName(data.user.name));
  let drawer: HTMLElement | null = null;
  let menuToggle: HTMLButtonElement | null = null;
  let mobileDrawer = $state(false);
  let drawerWasOpen = false;
  let previousFocus: HTMLElement | null = null;
  let restoreDrawerFocus = true;
  let rootHadScrollLockClass = false;
  let bodyHadScrollLockClass = false;

  const drawerScrollLockClass = 'portal-drawer-open';
  const languageNames = { en: 'English', es: 'Español', pt: 'Português (Brasil)' };


  const groupHeadings: Record<string, string> = {
    management: 'Management',
    finance: 'Finance & control',
  };

  const helpCopy = {
    en: { label: 'Help', detail: 'Field guides and task instructions' },
    es: { label: 'Ayuda', detail: 'Guías de campo e instrucciones de tareas' },
    pt: { label: 'Ajuda', detail: 'Guias de campo e instruções de tarefas' },
  } as const;

  const iconPath = (item: NavItem): string => navIconPath(item.label);
  const globalNavigation = $derived(
    portalGlobalNavigationForRole(data.user.role, data.user.workforceProfile),
  );
  const unreadNotifications = $derived(Math.max(0, Number(badges.notifications ?? 0)));
  const notificationsItem = $derived(
    globalNavigation.find((item) => item.section === 'notifications'),
  );
  const accountNavigation = $derived(
    accountNavigationFor(
      {
        primary: navigation,
        secondary: secondaryNavigation,
        admin: visibleAdmin,
        security: securityAdmin,
      },
      globalNavigation,
    ),
  );
  const moreGroups = $derived(
    moreNavigationGroups({
      secondary: secondaryNavigation,
      admin: showAdmin && (isManager || isFinance) ? visibleAdmin : [],
      security: showAdmin && canAudit ? securityAdmin : [],
    }).filter((entry) => entry.group !== 'account'),
  );
  const moreItems = $derived(moreGroups.flatMap((entry) => entry.items));
  const sectionDestinations = $derived.by(() => {
    const visible = [
      ...navigation,
      ...secondaryNavigation,
      ...(showAdmin && (isManager || isFinance) ? visibleAdmin : []),
      ...(showAdmin && canAudit ? securityAdmin : []),
      ...globalNavigation,
      { section: 'help', label: 'Help', icon: '?' },
    ];
    const seen = new SvelteSet<string>();
    return visible.filter((item) => {
      const href = itemHref(item);
      if (seen.has(href)) return false;
      seen.add(href);
      return true;
    });
  });
  const roleLabel = (value: string | undefined): string => {
    const normalized =
      value === 'owner_admin'
        ? 'owner'
        : value === 'finance_admin'
          ? 'finance'
          : value === 'project_manager'
            ? 'project_manager'
            : value === 'auditor_read_only'
              ? 'auditor_read_only'
              : value === 'worker' && data.user.workforceProfile
                ? data.user.workforceProfile
                : (value ?? 'worker');
    return translateControlledValue(locale, 'role', normalized);
  };

  const focusableSelector =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function drawerFocusableElements(): HTMLElement[] {
    return drawer
      ? Array.from(drawer.querySelectorAll<HTMLElement>(focusableSelector)).filter(
          (element) =>
            element.getAttribute('aria-hidden') !== 'true' &&
            getComputedStyle(element).display !== 'none' &&
            getComputedStyle(element).visibility !== 'hidden',
        )
      : [];
  }

  function closeDrawer(followingLink = false): void {
    restoreDrawerFocus = !followingLink;
    onCloseMenu();
  }

  function toggleNavigation(event?: MouseEvent): void {
    event?.preventDefault();
    onMenuToggle();
  }

  function handleSkipLinkClick(event: MouseEvent): void {
    const link = event.currentTarget as HTMLAnchorElement;
    const targetSelector = link.getAttribute('href');
    if (!targetSelector?.startsWith('#')) return;

    const target = document.querySelector<HTMLElement>(targetSelector);
    if (!target) return;

    event.preventDefault();
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus();
  }

  function handleDrawerKeydown(event: KeyboardEvent): void {
    if (!menuOpen || !mobileDrawer) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      closeDrawer();
      return;
    }

    if (event.key !== 'Tab') return;
    const focusable = drawerFocusableElements();
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function applyDrawerScrollLock(): void {
    const root = document.documentElement;
    const body = document.body;
    rootHadScrollLockClass = root.classList.contains(drawerScrollLockClass);
    bodyHadScrollLockClass = body.classList.contains(drawerScrollLockClass);
    root.classList.add(drawerScrollLockClass);
    body.classList.add(drawerScrollLockClass);
    drawerWasOpen = true;
    restoreDrawerFocus = true;
  }

  function releaseDrawerScrollLock(): void {
    if (!drawerWasOpen) return;

    const root = document.documentElement;
    const body = document.body;
    if (!rootHadScrollLockClass) root.classList.remove(drawerScrollLockClass);
    if (!bodyHadScrollLockClass) body.classList.remove(drawerScrollLockClass);
    rootHadScrollLockClass = false;
    bodyHadScrollLockClass = false;
    drawerWasOpen = false;
  }

  const currentNavItem = $derived(
    activeNavItem(sectionDestinations, {
      base,
      section: data.section,
      url: $page.url,
      role: data.user.role,
      itemHref,
    }),
  );
  const itemIsCurrent = (item: NavItem): boolean => currentNavItem === item;
  const currentInMore = $derived(Boolean(currentNavItem && moreItems.includes(currentNavItem)));
  const moreExpanded = $derived(moreOpen || currentInMore || (mobileDrawer && menuOpen));

  function toggleMore(event: Event): void {
    const open = (event.currentTarget as HTMLDetailsElement).open;
    if (open === moreExpanded) return;
    moreOpen = open;
    try {
      localStorage.setItem(moreOpenKey, open ? '1' : '0');
    } catch {
      // The disclosure still works without storage.
    }
  }

  function navigateSection(): void {
    closeDrawer(true);
  }

  $effect(() => {
    const hash = $page.url.hash;
    if (!hash) return;
    const known = sectionDestinations.some((item) =>
      subsectionsForNavItem(item, itemHref(item), data.user.role).some(
        (subsection) => new URL(subsection.href, $page.url).hash === hash,
      ),
    );
    if (!known) return;
    void tick().then(() => {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (!target) return;
      for (
        let ancestor = target.closest('details');
        ancestor;
        ancestor = ancestor.parentElement?.closest('details') ?? null
      )
        ancestor.open = true;
      if (
        !target.hasAttribute('tabindex') &&
        !['SUMMARY', 'A', 'BUTTON', 'INPUT'].includes(target.tagName)
      )
        target.setAttribute('tabindex', '-1');
      target.scrollIntoView({ block: 'start' });
      target.focus({ preventScroll: true });
    });
  });

  onMount(() => {
    try {
      moreOpen = localStorage.getItem(moreOpenKey) === '1';
    } catch {
      // Navigation stays available when storage is blocked.
    }
    const media = window.matchMedia('(max-width: 63.99rem)');
    const updateMobileDrawer = (): void => {
      mobileDrawer = media.matches;
    };
    updateMobileDrawer();
    media.addEventListener('change', updateMobileDrawer);
    document.addEventListener('keydown', handleDrawerKeydown);
    const skipLink = document.querySelector<HTMLAnchorElement>('a.skip-link[href^="#"]');
    skipLink?.addEventListener('click', handleSkipLinkClick);

    return () => {
      media.removeEventListener('change', updateMobileDrawer);
      document.removeEventListener('keydown', handleDrawerKeydown);
      skipLink?.removeEventListener('click', handleSkipLinkClick);
      releaseDrawerScrollLock();
    };
  });

  $effect(() => {
    const open = menuOpen && mobileDrawer;
    if (typeof document === 'undefined') return;

    if (open && !drawerWasOpen) {
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      applyDrawerScrollLock();
      void tick().then(() => {
        if (!drawerWasOpen) return;
        drawerFocusableElements()[0]?.focus();
      });
      return;
    }

    if (!open && drawerWasOpen) {
      releaseDrawerScrollLock();
      const focusTarget = previousFocus;
      previousFocus = null;
      if (restoreDrawerFocus) {
        if (focusTarget && document.contains(focusTarget))
          focusTarget.focus({ preventScroll: true });
        else menuToggle?.focus({ preventScroll: true });
      }
      restoreDrawerFocus = true;
    }
  });
</script>

{#snippet navigationRow(item: NavItem)}
  <div class="nav-entry">
    <div class="nav-entry-main">
      <a
        class:active={itemIsCurrent(item)}
        href={itemHref(item)}
        title={translate(item.label)}
        aria-current={itemIsCurrent(item) ? 'page' : undefined}
        onclick={navigateSection}
      >
        <span class="nav-icon" aria-hidden="true"
          ><PortalNavIcon path={iconPath(item)} centered={item.label === 'Settings'} /></span
        ><span class="nav-label">{translate(item.label)}</span
        >{#if (badges[item.section] ?? 0) > 0}<span
            class="nav-badge"
            aria-label={`${badges[item.section]} ${translate('pending')}`}
            >{badges[item.section]}</span
          >{/if}
      </a>
    </div>
  </div>
{/snippet}

<button
  type="button"
  class:visible={menuOpen && mobileDrawer}
  class="nav-backdrop"
  aria-label={translate('Close navigation')}
  aria-hidden={menuOpen && mobileDrawer ? undefined : 'true'}
  tabindex="-1"
  onclick={() => closeDrawer()}
></button>

<aside
  id="portal-navigation"
  class:open={menuOpen}
  bind:this={drawer}
  aria-label={translate('Portal navigation')}
  role={mobileDrawer ? 'dialog' : undefined}
  aria-modal={mobileDrawer ? 'true' : undefined}
  aria-hidden={mobileDrawer && !menuOpen ? 'true' : undefined}
  inert={mobileDrawer && !menuOpen ? true : undefined}
>
  <a
    class="portal-brand"
    href={`${base}/app/`}
    aria-label={`J&A Automation · ${translate('Home')}`}
    title={translate('Home')}
    onclick={() => closeDrawer(true)}
    ><img src={`${base}/app/logo.png`} alt="J&A Automation" /></a
  >
  <nav aria-label={translate('Primary navigation')}>
    {#each navigation as item}
      {@render navigationRow(item)}
    {/each}
    {#if moreItems.length}
      <details class="nav-more" open={moreExpanded} ontoggle={toggleMore}>
        <summary class="nav-more-toggle">
          <span class="nav-icon" aria-hidden="true"
            ><PortalNavIcon path="M5 12h.01M12 12h.01M19 12h.01" /></span
          ><span class="nav-label">{translate('More')}</span>
          <svg class="nav-more-chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false"
            ><path d="m4 6 4 4 4-4" /></svg
          >
        </summary>
        {#each moreGroups as entry (entry.group)}
          {#if groupHeadings[entry.group] && moreGroups.length > 1}
            <!-- Each heading folds its group so every group heading stays in
                 view on a 768 px tall screen; the current item's group opens. -->
            <details
              class="nav-group"
              open={entry.items.some((item) => itemIsCurrent(item)) || undefined}
            >
              <summary class="nav-heading nav-group-toggle"
                >{translate(groupHeadings[entry.group] ?? '')}<svg
                  class="nav-more-chevron"
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                  focusable="false"><path d="m4 6 4 4 4-4" /></svg
                ></summary
              >
              {#each entry.items as item}
                {@render navigationRow(item)}
              {/each}
            </details>
          {:else}
            {#if groupHeadings[entry.group]}
              <small class="nav-heading">{translate(groupHeadings[entry.group] ?? '')}</small>
            {/if}
            {#each entry.items as item}
              {@render navigationRow(item)}
            {/each}
          {/if}
        {/each}
      </details>
    {/if}
  </nav>
  <a
    href="https://webmail.j-aautomation.com/"
    target="_blank"
    rel="noopener noreferrer"
    class="portal-external-nav-link"
    title={translate('Company Webmail')}
  >
    <span class="nav-icon" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <rect width="20" height="16" x="2" y="4" rx="2"></rect>
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
      </svg>
    </span>
    <span class="nav-label">{translate('Company Webmail')}</span>
    <span class="nav-external-arrow" aria-hidden="true"><DirectionIcon direction="up-right" /></span
    >
  </a>
  <button class="signout" onclick={logout}>{translate('Sign out')}</button>
</aside>

<header>
  <div class="header-status">
    <button
      bind:this={menuToggle}
      type="button"
      class="menu-button"
      aria-label={translate('Toggle navigation')}
      aria-controls="portal-navigation"
      aria-expanded={menuOpen}
      onclick={toggleNavigation}
      onkeydown={(event) => {
        if (event.key === 'Tab' && !event.shiftKey && !mobileDrawer) {
          event.preventDefault();
          drawer?.querySelector<HTMLElement>('nav a')?.focus();
        }
      }}
    >
      <span></span><span></span>
    </button>
    {#if !online}
      <span class="connection offline" role="status"><i></i>{translate('Offline')}</span>
    {/if}
    {#if queue > 0}<span class="queue">{queue} {translate('queued')}</span>{/if}
    {#if syncMessage}<span class="sync-message" role="status">{translate(syncMessage)}</span>{/if}
  </div>
  <SectionNavigator
    items={sectionDestinations}
    shortcuts={navigationShortcutsFor(sectionDestinations, itemHref, data.user.role)}
    context={{
      role: data.user.role,
      workforceProfile: data.user.workforceProfile,
      canonicalOwner: data.user.canonicalOwner === true || data.canonicalOwner === true,
    }}
    currentSection={currentNavItem ? translate(currentNavItem.label) : ''}
    {locale}
    canSearchRecords={!['external_technician', 'supplier_coordinator'].includes(
      data.user.workforceProfile ?? '',
    ) || recordSuggestions.length > 0}
    recordSearchHref={['external_technician', 'supplier_coordinator'].includes(
      data.user.workforceProfile ?? '',
    )
      ? undefined
      : (query) => workspaceRecordSearchHref(base, data.user.role, query, locale)}
    {recordSuggestions}
    {mapRecord}
    recordEndpoint={mapRecord ? `${base}/app/api/search` : ''}
    itemHref={(item) => {
      const target = new URL(itemHref(item), $page.url);
      target.searchParams.set('lang', locale);
      return `${target.pathname}${target.search}${target.hash}`;
    }}
    {translate}
  />
  {#if notificationsItem}
    <a
      class="portal-notifications-link"
      class:active={itemIsCurrent(notificationsItem)}
      href={itemHref(notificationsItem)}
      title={translate('Notifications')}
      aria-label={unreadNotifications > 0
        ? `${translate('Notifications')} · ${unreadNotifications} ${translate('unread')}`
        : translate('Notifications')}
      aria-current={itemIsCurrent(notificationsItem) ? 'page' : undefined}
    >
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"><path d={navIconPaths.Notifications} /></svg
      >{#if unreadNotifications > 0}<span class="bell-badge" aria-hidden="true"
          >{unreadNotifications > 99 ? '99+' : unreadNotifications}</span
        >{/if}
    </a>
  {/if}
  {#if data.user.role === 'auditor_read_only'}
    <!-- One shell-level indicator instead of per-page wording (auditor-3). -->
    <span class="readonly-chip" title={translate('Read-only')}>{translate('Read-only')}</span>
  {/if}
  <label class="locale-switcher">
    <span class="visually-hidden">{translate('Language')}</span>
    <select aria-label={translate('Language')} value={locale} onchange={changeLocale}>
      {#each portalLocales as supportedLocale}
        <option value={supportedLocale} aria-label={translate(languageNames[supportedLocale])}
          >{supportedLocale === 'pt' ? 'PT-BR' : supportedLocale.toUpperCase()}</option
        >
      {/each}
    </select>
  </label>
  <div class="account-menu-wrap">
    <button
      type="button"
      class="user account-trigger"
      aria-label={translate('Account options')}
      aria-haspopup="menu"
      aria-expanded={accountOpen}
      aria-controls="account-menu"
      onclick={() => (accountOpen = !accountOpen)}
      onkeydown={(event) => {
        if (event.key === 'Escape') accountOpen = false;
      }}
    >
      <span class="user-avatar" aria-hidden="true">{initials(displayName)}</span>
      <span class="user-copy"><b>{displayName}</b><small>{roleLabel(data.user.role)}</small></span>
      <span class="account-chevron" aria-hidden="true">
        <svg viewBox="0 0 16 16" focusable="false">
          <path d={accountOpen ? 'm3.5 9.5 4.5-4 4.5 4' : 'm3.5 6.5 4.5 4 4.5-4'} />
        </svg>
      </span>
    </button>
    {#if accountOpen}
      <div
        id="account-menu"
        class="account-menu"
        role="menu"
        aria-label={translate('Account options')}
      >
        <div class="account-menu-summary" role="presentation">
          <span class="portal-kicker">{translate('SIGNED IN')}</span>
          <strong>{displayName}</strong>
          <small
            >{translate('Role')}: {roleLabel(data.user.role)}{#if data.user.role === 'auditor_read_only'}
              · {translate('Read-only')}{/if}</small
          >
        </div>
        {#each accountNavigation as item}
          {@const accountDetail =
            item.section === 'pay'
              ? 'Compensation, expenses and pay history'
              : item.section === 'documents'
                ? 'Private files shared with your workspace'
                : item.section === 'profile'
                  ? 'Personal details, MFA and availability'
                  : ''}
          {@const accountIcon = item.section === 'documents' ? '□' : '◎'}
          <a
            role="menuitem"
            href={itemHref(item)}
            aria-current={itemIsCurrent(item) ? 'page' : undefined}
            onclick={() => (accountOpen = false)}
          >
            <span class="account-menu-icon" aria-hidden="true">
              {#if item.section === 'pay'}
                <!-- Neutral wallet: pay can be in USD, MXN, EUR or BRL. -->
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"><path d={navIconPaths['My Pay']} /></svg
                >
              {:else if item.section === 'notifications'}
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"><path d={navIconPaths.Notifications} /></svg
                >
              {:else}{accountIcon}{/if}
            </span>
            <span
              ><b>{translate(item.label)}</b>{#if accountDetail}<small
                  >{translate(accountDetail)}</small
                >{/if}</span
            >
          </a>
        {/each}
        <div class="account-menu-divider" role="separator"></div>
        <a role="menuitem" href={`${base}/app/help`} onclick={() => (accountOpen = false)}>
          <span class="account-menu-icon" aria-hidden="true">?</span>
          <span><b>{helpCopy[locale].label}</b><small>{helpCopy[locale].detail}</small></span>
        </a>
        <div class="account-menu-divider" role="separator"></div>
        <a
          role="menuitem"
          href="https://webmail.j-aautomation.com/"
          target="_blank"
          rel="noopener noreferrer"
          onclick={() => (accountOpen = false)}
        >
          <span class="account-menu-icon" aria-hidden="true">✉</span>
          <span
            ><b>{translate('Company Webmail')}</b><small
              >webmail.j-aautomation.com <DirectionIcon direction="up-right" size={14} /></small
            ></span
          >
        </a>
        <div class="account-menu-divider" role="separator"></div>
        <button type="button" class="account-signout" role="menuitem" onclick={logout}>
          <span class="account-menu-icon" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
              focusable="false"
              ><path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M14 8l4 4-4 4M8 12h10" /></svg
            >
          </span>
          <span
            ><b>{translate('Sign out')}</b><small
              >{translate('End this session on this device')}</small
            ></span
          >
        </button>
      </div>
    {/if}
  </div>
</header>

<style>
  /* One search on the left, personal controls on the right. */
  :global(.portal-layout > header) {
    justify-content: flex-start;
    gap: 0.75rem;
  }
  :global(.portal-layout > header .header-status) {
    flex: 0 0 auto;
  }
  :global(.portal-layout > header .section-trigger) {
    margin-right: auto;
  }
  .nav-more {
    display: grid;
    gap: 0.28rem;
  }
  .nav-more-toggle {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    min-height: var(--ja-target-min, 44px);
    padding: 0.6rem 0.72rem;
    border: 1px solid transparent;
    border-radius: 0.65rem;
    color: var(--ja-text-secondary);
    font-size: 0.84rem;
    font-weight: 500;
    cursor: pointer;
    list-style: none;
    user-select: none;
  }
  .nav-more-toggle::-webkit-details-marker {
    display: none;
  }
  /* The shared details chevron would duplicate this row's own chevron. */
  details.nav-more > summary.nav-more-toggle::after {
    content: none;
    display: none;
  }
  .nav-more-chevron {
    width: 1rem;
    height: 1rem;
    margin-left: auto;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
    transition: transform 160ms ease;
  }
  .nav-more[open] > .nav-more-toggle .nav-more-chevron {
    transform: rotate(180deg);
  }
  .nav-more-toggle:hover {
    color: var(--ja-ink);
    background: #eaeae5;
  }
  .nav-more-toggle:focus-visible {
    outline: 2px solid var(--ja-border-focus);
    outline-offset: 2px;
  }
  .nav-more :global(.nav-heading) {
    padding-top: 0.7rem;
    font-family: inherit;
    font-size: 0.72rem;
    font-weight: 650;
    letter-spacing: 0.02em;
    text-transform: none;
  }
  .nav-group {
    display: grid;
    gap: 0.28rem;
  }
  summary.nav-group-toggle.nav-heading {
    display: flex;
    align-items: center;
    min-height: var(--ja-target-min, 44px);
    padding-inline: 0.72rem;
    cursor: pointer;
    list-style: none;
    user-select: none;
  }
  .nav-group-toggle::-webkit-details-marker {
    display: none;
  }
  details.nav-group > summary.nav-group-toggle::after {
    content: none;
    display: none;
  }
  .nav-group[open] > .nav-group-toggle .nav-more-chevron {
    transform: rotate(180deg);
  }
  .nav-group-toggle:focus-visible {
    outline: 2px solid var(--ja-border-focus);
    outline-offset: 2px;
  }
  .nav-badge {
    margin-left: auto;
    min-width: 1.5rem;
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    background: var(--ja-red, #b42318);
    color: #fff;
    font-size: 0.75rem;
    font-weight: 700;
    line-height: 1.35;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .portal-notifications-link {
    box-sizing: border-box;
    display: inline-grid;
    place-items: center;
    flex: 0 0 44px;
    width: 44px;
    height: 44px;
    border: 1px solid var(--ja-border-subdued, #d6d5d2);
    border-radius: 0.65rem;
    color: var(--ja-ink, #24251f);
    background: white;
    text-decoration: none;
  }

  .portal-notifications-link:hover,
  .portal-notifications-link.active {
    background: var(--ja-canvas, #f6f6f1);
  }

  .portal-notifications-link:focus-visible {
    outline: 2px solid var(--ja-accent, #2349b5);
    outline-offset: 2px;
  }

  .portal-notifications-link {
    position: relative;
  }
  .readonly-chip {
    flex: 0 0 auto;
    padding: 0.3rem 0.6rem;
    border: 1px solid var(--ja-border-subdued, #d6d5d2);
    border-radius: 999px;
    background: var(--ja-canvas, #f6f6f1);
    color: var(--ja-text-secondary, #55534c);
    font-size: 0.75rem;
    font-weight: 650;
    white-space: nowrap;
  }
  @media (max-width: 520px) {
    .readonly-chip {
      display: none;
    }
  }
  .bell-badge {
    position: absolute;
    top: -6px;
    right: -6px;
    min-width: 1.25rem;
    height: 1.25rem;
    padding: 0 0.3rem;
    border-radius: 999px;
    background: var(--ja-red, #b42318);
    color: #fff;
    font-size: 0.7rem;
    font-weight: 700;
    line-height: 1.25rem;
    text-align: center;
    font-variant-numeric: tabular-nums;
    box-shadow: 0 0 0 2px #fff;
  }
  @media (max-width: 520px) {
    /* The bell stays on phones: it is the only place the unread count shows. */
    .portal-notifications-link {
      flex-basis: 40px;
      width: 40px;
      height: 40px;
    }
  }
</style>
