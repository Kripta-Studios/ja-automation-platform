<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { page } from '$app/stores';
  import { portalLocales, type PortalLocale } from './portal-i18n';
  import { translateControlledValue } from './i18n/controlled-values';
  import { accountNavigationFor, type NavItem } from './portal-navigation';
  import PortalNavIcon from './PortalNavIcon.svelte';

  type ChromeData = {
    section: string;
    user: { name: string; role?: string };
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
  } = $props();

  let accountOpen = $state(false);
  let drawer: HTMLElement | null = null;
  let menuToggle: HTMLButtonElement | null = null;
  let mobileDrawer = $state(false);
  let drawerWasOpen = false;
  let previousFocus: HTMLElement | null = null;
  let rootHadScrollLockClass = false;
  let bodyHadScrollLockClass = false;

  const drawerScrollLockClass = 'portal-drawer-open';

  const navIconPaths: Record<string, string> = {
    Today: 'M3 10.75 12 3l9 7.75V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-10.25Z',
    Dashboard: 'M3 10.75 12 3l9 7.75V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-10.25Z',
    Time: 'M12 7v5l3.5 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    Reports: 'M5 3.5h14v17H5zM8 8h8M8 12h8M8 16h5',
    Expenses: 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h5',
    Projects: 'M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v4H4zM14 15h6v4h-6z',
    Clients:
      'M16 20v-1.5a3.5 3.5 0 0 0-7 0V20M12.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM17 8a2.5 2.5 0 1 1 0 5',
    Team: 'M16 20v-1.5a3.5 3.5 0 0 0-7 0V20M12.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM17 8a2.5 2.5 0 1 1 0 5',
    Planning: 'M5 4h14v16H5zM8 2v4M16 2v4M5 9h14M9 13h2M13 13h2M9 17h2',
    'PLC / Technical': 'M3 13h4l2-7 4 12 2-6h6',
    Approvals: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-4-9 2.5 2.5L16.5 8',
    Billing: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 8h6M9 12h6M9 16h4',
    Invoices: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 8h6M9 12h6M9 16h4',
    Finance: 'M4 18 9 12l4 3 7-9M15 6h5v5',
    Documents: 'M6 3h9l3 3v15H6zM14 3v4h4M9 12h6M9 16h6',
    Notifications: 'M6 17h12l-1.5-2v-4a4.5 4.5 0 0 0-9 0v4L6 17ZM10 20h4M9.5 7.5a3 3 0 0 1 5 0',
    Profile: 'M20 21a8 8 0 0 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
    Settings:
      'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm8.5 4a6.5 6.5 0 0 0-.15-1.4l1.45-1.12-2-3.46-1.72.68a7 7 0 0 0-2.4-1.4L15.45 3h-4l-.26 2.3a7 7 0 0 0-2.4 1.4l-1.72-.68-2 3.46 1.45 1.12a6.5 6.5 0 0 0 0 2.8l-1.45 1.12 2 3.46 1.72-.68a7 7 0 0 0 2.4 1.4l.26 2.3h4l.26-2.3a7 7 0 0 0 2.4-1.4l1.72.68 2-3.46-1.45-1.12c.1-.45.15-.92.15-1.4Z',
    Audit: 'M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3Zm-3 9 2 2 4-4',
    'My Pay': 'M4 7h16v10H4zM4 10h16M8 14h2',
  };

  const iconPath = (item: NavItem): string => navIconPaths[item.label] ?? 'M5 12h14M12 5l7 7-7 7';
  const accountNavigation = $derived(
    accountNavigationFor({
      primary: navigation,
      secondary: secondaryNavigation,
      admin: visibleAdmin,
      security: securityAdmin,
    }),
  );
  const roleLabel = (value: string | undefined): string => {
    const normalized =
      value === 'owner_admin'
        ? 'owner'
        : value === 'finance_admin'
          ? 'finance'
          : value === 'project_manager'
            ? 'manager'
            : value === 'auditor_read_only'
              ? 'admin'
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

  function restoreMenuFocus(attempt = 0): void {
    if (typeof document === 'undefined') return;

    document
      .querySelector<HTMLButtonElement>(
        `.menu-button[aria-label="${translate('Toggle navigation')}"]`,
      )
      ?.focus();

    if (attempt < 20 && typeof window !== 'undefined') {
      window.setTimeout(() => restoreMenuFocus(attempt + 1), 25);
    }
  }

  function closeDrawer(): void {
    const shouldRestoreFocus = mobileDrawer;
    onCloseMenu();
    if (shouldRestoreFocus && typeof window !== 'undefined') {
      window.setTimeout(() => restoreMenuFocus(), 0);
    }
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

  function itemIsCurrent(item: NavItem): boolean {
    const allItems = [...navigation, ...secondaryNavigation, ...visibleAdmin, ...securityAdmin];
    const itemTarget = itemHref(item);

    const current = $page.url;
    const target = new URL(itemTarget, current.origin);
    const routeSignature = (url: URL): string => {
      const params = new URLSearchParams(url.search);
      params.delete('lang');
      params.delete('q');
      const search = params.toString();
      return `${url.pathname}${search ? `?${search}` : ''}`;
    };
    const targetSignature = routeSignature(target);
    const currentSignature = routeSignature(current);
    const exact = allItems.find(
      (candidate) =>
        routeSignature(new URL(itemHref(candidate), current.origin)) === currentSignature,
    );
    if (exact) return exact === item;
    if (targetSignature !== currentSignature && item.section !== data.section) return false;

    return (
      item.section === data.section &&
      allItems.find((candidate) => candidate.section === data.section) === item
    );
  }

  onMount(() => {
    const media = window.matchMedia('(max-width: 767px)');
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
      if (focusTarget && document.contains(focusTarget)) focusTarget.focus();
      else menuToggle?.focus();
    }
  });
</script>

<button
  type="button"
  class:visible={menuOpen && mobileDrawer}
  class="nav-backdrop"
  aria-label={translate('Close navigation')}
  aria-hidden={menuOpen && mobileDrawer ? undefined : 'true'}
  tabindex="-1"
  onclick={closeDrawer}
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
  <a class="portal-brand" href={`${base}/app/`} onclick={closeDrawer}
    ><img src={`${base}/app/logo.png`} alt="J&A Automation" /></a
  >
  <nav aria-label={translate('Primary navigation')}>
    {#each navigation as item}
      <a
        class:active={itemIsCurrent(item)}
        href={itemHref(item)}
        title={translate(item.label)}
        aria-current={itemIsCurrent(item) ? 'page' : undefined}
        onclick={closeDrawer}
      >
        <span class="nav-icon" aria-hidden="true"
          ><PortalNavIcon path={iconPath(item)} centered={item.label === 'Settings'} /></span
        ><span class="nav-label">{translate(item.label)}</span>
      </a>
    {/each}
    <small class="nav-heading">{translate('SECONDARY')}</small>
    {#each secondaryNavigation as item}
      <a
        class:active={itemIsCurrent(item)}
        href={itemHref(item)}
        title={translate(item.label)}
        aria-current={itemIsCurrent(item) ? 'page' : undefined}
        onclick={closeDrawer}
      >
        <span class="nav-icon" aria-hidden="true"
          ><PortalNavIcon path={iconPath(item)} centered={item.label === 'Settings'} /></span
        ><span class="nav-label">{translate(item.label)}</span>
      </a>
    {/each}
  </nav>
  {#if showAdmin && (visibleAdmin.length > 0 || (canAudit && securityAdmin.length > 0))}
    <div class="admin-nav">
      {#if isManager || isFinance}
        {#if visibleAdmin.length > 0}<small class="nav-heading">{translate('ADMINISTRATION')}</small
          >{/if}
        {#each visibleAdmin as item}
          <a
            class:active={itemIsCurrent(item)}
            href={itemHref(item)}
            title={translate(item.label)}
            aria-current={itemIsCurrent(item) ? 'page' : undefined}
            onclick={closeDrawer}
          >
            <span class="nav-icon" aria-hidden="true"
              ><PortalNavIcon path={iconPath(item)} centered={item.label === 'Settings'} /></span
            ><span class="nav-label">{translate(item.label)}</span>
          </a>
        {/each}
      {/if}
      {#if canAudit && securityAdmin.length > 0}
        <small class="nav-heading">{translate('SECURITY')}</small>
        {#each securityAdmin as item}
          <a
            class:active={itemIsCurrent(item)}
            href={itemHref(item)}
            title={translate(item.label)}
            aria-current={itemIsCurrent(item) ? 'page' : undefined}
            onclick={closeDrawer}
          >
            <span class="nav-icon" aria-hidden="true"
              ><PortalNavIcon path={iconPath(item)} centered={item.label === 'Settings'} /></span
            ><span class="nav-label">{translate(item.label)}</span>
          </a>
        {/each}
      {/if}
    </div>
  {/if}
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
    <span class:offline={!online} class="connection"
      ><i></i>{online ? translate('Online') : translate('Offline')}</span
    >
    {#if queue > 0}<span class="queue">{queue} {translate('queued')}</span>{/if}
    {#if syncMessage}<span class="sync-message" role="status">{translate(syncMessage)}</span>{/if}
  </div>
  <label class="locale-switcher">
    <span class="visually-hidden">{translate('Language')}</span>
    <select aria-label={translate('Language')} value={locale} onchange={changeLocale}>
      {#each portalLocales as supportedLocale}
        <option value={supportedLocale}
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
      <span class="user-avatar" aria-hidden="true">{initials(data.user.name)}</span>
      <span class="user-copy"
        ><b>{data.user.name}</b><small>{roleLabel(data.user.role)}</small></span
      >
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
          <strong>{data.user.name}</strong>
          <small>{roleLabel(data.user.role)} {translate('workspace access')}</small>
        </div>
        {#each accountNavigation as item}
          {@const accountDetail =
            item.section === 'pay'
              ? 'Compensation, expenses and pay history'
              : item.section === 'documents'
                ? 'Private files shared with your workspace'
                : 'Personal details, MFA and availability'}
          {@const accountIcon =
            item.section === 'pay' ? '€' : item.section === 'documents' ? '□' : '◎'}
          <a role="menuitem" href={itemHref(item)} onclick={() => (accountOpen = false)}>
            <span class="account-menu-icon" aria-hidden="true">{accountIcon}</span>
            <span><b>{translate(item.label)}</b><small>{translate(accountDetail)}</small></span>
          </a>
        {/each}
        <div class="account-menu-divider" role="separator"></div>
        <button type="button" class="account-signout" role="menuitem" onclick={logout}>
          <span class="account-menu-icon" aria-hidden="true">↪</span>
          <span
            ><b>{translate('Log out')}</b><small
              >{translate('End this session on this device')}</small
            ></span
          >
        </button>
      </div>
    {/if}
  </div>
</header>
