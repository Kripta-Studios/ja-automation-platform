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
</script>

<aside class:open={menuOpen}>
  <a class="portal-brand" href={`${base}/app/`}
    ><img src={`${base}/app/logo.png`} alt="J&A Automation" /></a
  >
  <nav aria-label="Primary navigation">
    {#each navigation as item}
      <a class:active={data.section === item.section} href={itemHref(item)} onclick={onCloseMenu}>
        <span class="nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span>
      </a>
    {/each}
    <small>SECONDARY</small>
    {#each secondaryNavigation as item}
      <a class:active={data.section === item.section} href={itemHref(item)} onclick={onCloseMenu}>
        <span class="nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span>
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
            onclick={onCloseMenu}
          >
            <span class="nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span>
          </a>
        {/each}
      {/if}
      {#if canAudit}
        <small>SECURITY</small>
        {#each securityAdmin as item}
          <a
            class:active={data.section === item.section}
            href={itemHref(item)}
            onclick={onCloseMenu}
          >
            <span class="nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span>
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
  <a class="user" href={href('profile')}>
    <span class="user-avatar" aria-hidden="true">{initials(data.user.name)}</span>
    <span class="user-copy"><b>{data.user.name}</b><small>{data.user.role ?? 'worker'}</small></span
    >
  </a>
</header>
