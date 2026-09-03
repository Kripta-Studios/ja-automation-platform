import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('UI_PLAN shell integration', () => {
  const shell = read('apps/portal/src/lib/PortalShell.svelte');
  const today = read('apps/portal/src/lib/portal/sections/TodaySection.svelte');
  const navigation = read('apps/portal/src/lib/portal-navigation.ts');
  const catalog = read('apps/portal/src/lib/i18n/catalog.ts');
  const coverageTranslations = read('apps/portal/src/lib/i18n/coverage-translations.ts');
  const controlledValues = read('apps/portal/src/lib/i18n/controlled-values.ts');

  it('mounts the authorized client and team directories for their query views', () => {
    expect(shell).toContain(
      "import ClientDirectorySection from './portal/sections/ClientDirectorySection.svelte'",
    );
    expect(shell).toMatch(
      /import TeamDirectorySection(?:,\s*\{[\s\S]*?\})?\s+from '\.\/portal\/sections\/TeamDirectorySection\.svelte'/u,
    );
    expect(shell).toContain("data.section === 'projects' && currentView === 'clients'");
    expect(shell).toContain("data.section === 'projects' && currentView === 'team'");
    expect(shell).toContain('<ClientDirectorySection');
    expect(shell).toContain('<TeamDirectorySection');

    const clientBranchStart = shell.indexOf("currentView === 'clients'");
    const teamBranchStart = shell.indexOf("currentView === 'team'");
    expect(clientBranchStart).toBeGreaterThan(-1);
    expect(teamBranchStart).toBeGreaterThan(clientBranchStart);
    expect(shell.slice(clientBranchStart, teamBranchStart)).not.toMatch(
      /transitionProject|Begin close|Close project|client_rate|internal_cost|compensation/u,
    );
  });

  it('does not initialize conditional offline identity when deployment disables it', () => {
    const shell = read('apps/portal/src/lib/PortalShell.svelte');
    const layout = read('apps/portal/src/routes/+layout.server.ts');

    expect(layout).toContain('offlineEnabled:');
    expect(layout).toContain('JA_OFFLINE_ENABLED');
    expect(shell).toMatch(
      /if \(data\.offlineEnabled !== false\) \{[\s\S]*?configureOfflineIdentity\(data\.user\.id\)/,
    );
  });

  it('updates the locale URL through the SvelteKit router state API', () => {
    expect(shell).toContain("import { replaceState } from '$app/navigation'");
    expect(shell).toContain('replaceState(url, {})');
    expect(shell).not.toContain('history.replaceState');
  });

  it('keeps global search grouped, keyboard reachable and access-scoped', () => {
    expect(shell).toContain('groupedSearchSuggestions');
    expect(shell).toContain('groupedSearchResults');
    expect(shell).toContain('role="listbox"');
    expect(shell).toContain('role="option"');
    expect(shell).toContain('role="group"');
    expect(shell).toContain('event.ctrlKey || event.metaKey');
    expect(shell).toContain("event.key.toLowerCase() !== 'k'");
    expect(shell).toContain("document.addEventListener('keydown', handleGlobalKeydown)");
    expect(shell).toContain('aria-controls="portal-search-popover"');
    expect(shell).toContain('Only records in your access scope');
  });

  it('exposes only truthful dashboard actions and feedback state', () => {
    expect(today).toContain('dashboard-quick-actions');
    expect(today).toContain('canCreateProject');
    expect(today).toContain('canCreateInvoiceDraft && invoiceDraftHref');
    expect(today).toContain('canViewPendingReports');
    expect(today).toContain('href={`${base}/app/projects#new-project`}');
    expect(shell).toContain('<ToastRegion');
    expect(shell).toContain('toasts={toastItems}');
    expect(shell).toContain('ondismiss={dismissToast}');
    expect(shell).toContain("form?.success ? 'success' : 'danger'");
    expect(shell).toContain('securitySucceeded');
  });

  it('projects the role allowlist to four mobile destinations plus More', () => {
    expect(navigation).toContain('navigation.primary.slice(0, 4)');
    expect(shell).toContain('class="bottom-nav-more"');
    expect(shell).toContain('aria-controls="portal-navigation"');
    expect(shell).toContain("{translate('More')}");
  });

  it('covers UI_PLAN wording in the canonical ES/PT catalogs', () => {
    for (const value of [
      "'Revenue cap': 'Límite de presupuesto (Cap)'",
      "'Daily rate': 'Tarifa diaria'",
      "'Fixed fee / milestones': 'Precio cerrado / Hitos'",
      "'All streams': 'Todos los conceptos'",
      "'Open PDF': 'Abrir PDF'",
      "'Step-up authentication is active for the next 10 minutes.':\n    'Autenticación reforzada activa (10 min).'",
      "'Revenue cap': 'Limite de orçamento (Cap)'",
      "'Daily rate': 'Taxa diária'",
      "'Fixed fee / milestones': 'Preço fechado / Marcos'",
      "'All streams': 'Todos os conceitos'",
      "'Open PDF': 'Abrir PDF'",
      "'Step-up authentication is active for the next 10 minutes.':\n    'Autenticação reforçada ativa (10 min).'",
    ]) {
      expect(catalog).toContain(value);
    }
    expect(coverageTranslations).toContain(
      "'active projects': ['proyectos activos', 'projetos ativos']",
    );
    expect(controlledValues).toContain("time_and_materials: 'Time & materials'");
    expect(controlledValues).toContain("revenue_cap: 'Revenue cap'");
    expect(controlledValues).toContain("daily: 'Daily rate'");
    expect(controlledValues).toContain("fixed_fee: 'Fixed fee / milestones'");
  });
});
