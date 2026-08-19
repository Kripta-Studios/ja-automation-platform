<script lang="ts">
  import { portalLocales, type PortalLocale } from './portal-i18n';
  import type { NavItem } from './portal-navigation';

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
    href,
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
    href: (section: string) => string;
    itemHref: (item: NavItem) => string;
    initials: (name: string) => string;
    logout: () => Promise<void>;
    changeLocale: (event: Event) => void;
    onMenuToggle: () => void;
    onCloseMenu: () => void;
  } = $props();

  let accountOpen = $state(false);

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
</script>

<aside class:open={menuOpen}>
  <a class="portal-brand" href={`${base}/app/`}
    ><img src={`${base}/app/logo.png`} alt="J&A Automation" /></a
  >
  <nav aria-label="Primary navigation">
    {#each navigation as item}
      <a
        class:active={data.section === item.section}
        href={itemHref(item)}
        title={item.label}
        onclick={onCloseMenu}
      >
        <span class="nav-icon" aria-hidden="true"
          ><svg viewBox="0 0 24 24" focusable="false"><path d={iconPath(item)} /></svg></span
        ><span>{item.label}</span>
      </a>
    {/each}
    <small>SECONDARY</small>
    {#each secondaryNavigation as item}
      <a
        class:active={data.section === item.section}
        href={itemHref(item)}
        title={item.label}
        onclick={onCloseMenu}
      >
        <span class="nav-icon" aria-hidden="true"
          ><svg viewBox="0 0 24 24" focusable="false"><path d={iconPath(item)} /></svg></span
        ><span>{item.label}</span>
      </a>
    {/each}
  </nav>
  {#if showAdmin}
    <div class="admin-nav">
      {#if isManager || isFinance}
        <small>ADMINISTRATION</small>
        {#each visibleAdmin as item}
          <a
            class:active={data.section === item.section}
            href={itemHref(item)}
            title={item.label}
            onclick={onCloseMenu}
          >
            <span class="nav-icon" aria-hidden="true"
              ><svg viewBox="0 0 24 24" focusable="false"><path d={iconPath(item)} /></svg></span
            ><span>{item.label}</span>
          </a>
        {/each}
      {/if}
      {#if canAudit}
        <small>SECURITY</small>
        {#each securityAdmin as item}
          <a
            class:active={data.section === item.section}
            href={itemHref(item)}
            title={item.label}
            onclick={onCloseMenu}
          >
            <span class="nav-icon" aria-hidden="true"
              ><svg viewBox="0 0 24 24" focusable="false"><path d={iconPath(item)} /></svg></span
            ><span>{item.label}</span>
          </a>
        {/each}
      {/if}
    </div>
  {/if}
  <button class="signout" onclick={logout}>Sign out</button>
</aside>

<header>
  <div class="header-status">
    <button
      class="menu-button"
      aria-label="Toggle navigation"
      aria-expanded={menuOpen}
      onclick={onMenuToggle}
    >
      <span></span><span></span>
    </button>
    <span class:offline={!online} class="connection"><i></i>{online ? 'Online' : 'Offline'}</span>
    {#if queue > 0}<span class="queue">{queue} queued</span>{/if}
    {#if syncMessage}<span class="sync-message" role="status">{syncMessage}</span>{/if}
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
      aria-haspopup="menu"
      aria-expanded={accountOpen}
      onclick={() => (accountOpen = !accountOpen)}
      onkeydown={(event) => {
        if (event.key === 'Escape') accountOpen = false;
      }}
    >
      <span class="user-avatar" aria-hidden="true">{initials(data.user.name)}</span>
      <span class="user-copy"
        ><b>{data.user.name}</b><small>{data.user.role ?? 'worker'}</small></span
      >
      <span class="account-chevron" aria-hidden="true">{accountOpen ? '⌃' : '⌄'}</span>
    </button>
    {#if accountOpen}
      <div class="account-menu" role="menu" aria-label="Account options">
        <div class="account-menu-summary" role="presentation">
          <span class="portal-kicker">SIGNED IN</span>
          <strong>{data.user.name}</strong>
          <small>{data.user.role ?? 'worker'} workspace access</small>
        </div>
        <a role="menuitem" href={href('profile')} onclick={() => (accountOpen = false)}>
          <span class="account-menu-icon" aria-hidden="true">◎</span>
          <span><b>Profile & security</b><small>Personal details, MFA and availability</small></span
          >
        </a>
        <a role="menuitem" href={href('notifications')} onclick={() => (accountOpen = false)}>
          <span class="account-menu-icon" aria-hidden="true">◌</span>
          <span><b>Notifications</b><small>Review changes and approval activity</small></span>
        </a>
        <a role="menuitem" href={href('pay')} onclick={() => (accountOpen = false)}>
          <span class="account-menu-icon" aria-hidden="true">€</span>
          <span><b>My pay</b><small>Compensation, expenses and pay history</small></span>
        </a>
        <a role="menuitem" href={href('documents')} onclick={() => (accountOpen = false)}>
          <span class="account-menu-icon" aria-hidden="true">□</span>
          <span><b>My documents</b><small>Private files shared with your workspace</small></span>
        </a>
        <div class="account-menu-divider" role="separator"></div>
        <button type="button" class="account-signout" role="menuitem" onclick={logout}>
          <span class="account-menu-icon" aria-hidden="true">↪</span>
          <span><b>Log out</b><small>End this session on this device</small></span>
        </button>
      </div>
    {/if}
  </div>
</header>
