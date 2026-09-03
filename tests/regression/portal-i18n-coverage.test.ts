import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertPortalCatalogParity,
  INVARIANT_TRANSLATION_KEYS,
  isExplicitCoverageTranslation,
  isCoverageInvariantKey,
  portalCatalog,
  portalCatalogKeys,
  renderPortalMessage,
  portalText,
  translateReportHistoryAction,
} from '../../apps/portal/src/lib/portal-i18n';
import {
  PORTAL_ACTION_KEYS,
  PORTAL_COVERAGE_KEYS,
  PORTAL_LITERAL_KEYS,
} from '../../apps/portal/src/lib/i18n/catalog-coverage';
import {
  controlledValueDomains,
  hasControlledValue,
  translateControlledValue,
  type ControlledValueDomain,
} from '../../apps/portal/src/lib/i18n/controlled-values';

const sourceRoot = resolve(process.cwd(), 'apps/portal/src');
const actionRoot = resolve(sourceRoot, 'lib/server/actions');

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function componentSources(): string[] {
  return walk(sourceRoot)
    .filter((path) => /\.(?:svelte|ts)$/.test(path))
    .filter((path) => !path.endsWith('.test.ts'))
    .filter((path) => !path.includes(join('lib', 'i18n')));
}

function translatedLiteralKeys(source: string): string[] {
  const keys = new Set<string>();
  for (const pattern of [
    /(?<![A-Za-z0-9_$])(?:translate|t|portalText)(?![A-Za-z0-9_$])\s*\(\s*'([^'\r\n]*)'/g,
    /(?<![A-Za-z0-9_$])(?:translate|t|portalText)(?![A-Za-z0-9_$])\s*\(\s*"([^"\r\n]*)"/g,
  ]) {
    for (const match of source.matchAll(pattern)) keys.add(match[1]);
  }
  return [...keys].sort();
}

function actionMessageKeys(): string[] {
  const keys = new Set<string>();
  for (const path of walk(actionRoot).filter(
    (candidate) => candidate.endsWith('.ts') && !candidate.endsWith('.test.ts'),
  )) {
    const source = readFileSync(path, 'utf8');
    for (const match of source.matchAll(/['"](action\.[A-Za-z0-9_.-]+)['"]/g)) keys.add(match[1]);
  }
  // billing-actions.ts constructs these four keys from the persisted job state.
  for (const state of ['failed', 'processing', 'queued', 'ready'])
    keys.add(`action.billing.accountingPack.${state}`);
  return [...keys].sort();
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{([\w.-]+)\}/g)].map((match) => match[1]).sort();
}

describe('portal i18n coverage contract', () => {
  it('exposes a complete typed catalog for every locale', () => {
    expect(portalCatalogKeys.length).toBeGreaterThan(1000);
    expect(assertPortalCatalogParity()).toEqual([]);
  });

  it('covers every literal used by components/routes and every action message key', () => {
    const usedComponentKeys = new Set(
      componentSources().flatMap((path) => translatedLiteralKeys(readFileSync(path, 'utf8'))),
    );
    const usedActionKeys = new Set(actionMessageKeys());
    const catalogKeys = new Set(portalCatalogKeys);

    expect([...usedComponentKeys].filter((key) => !catalogKeys.has(key))).toEqual([]);
    expect([...usedActionKeys].filter((key) => !catalogKeys.has(key))).toEqual([]);
    expect([...usedComponentKeys].length).toBeGreaterThan(900);
    expect([...usedActionKeys].length).toBeGreaterThan(150);
    expect(
      [...usedComponentKeys].filter((key) => !PORTAL_LITERAL_KEYS.includes(key as never)),
    ).toEqual([]);
    expect([...usedActionKeys].every((key) => PORTAL_ACTION_KEYS.includes(key as never))).toBe(
      true,
    );
  });

  it('keeps interpolation placeholders identical across EN, ES and PT-BR', () => {
    for (const key of portalCatalogKeys) {
      const expected = placeholders(portalCatalog.en[key]);
      expect(placeholders(portalCatalog.es[key]), `es placeholder mismatch: ${key}`).toEqual(
        expected,
      );
      expect(placeholders(portalCatalog.pt[key]), `pt placeholder mismatch: ${key}`).toEqual(
        expected,
      );
    }
  });

  it('does not ship obvious English sentence residue in ES or PT-BR UI copy', () => {
    const englishResidue =
      /\b(?:this|your|with|from|before|after|review|fields|screen|workspace|only|and|will|must|cannot|should|available|authenticated|replace|selected|required)\b/i;
    const failures = (['es', 'pt'] as const).flatMap((locale) =>
      portalCatalogKeys
        .filter((key) => !isCoverageInvariantKey(key))
        .filter((key) => englishResidue.test(portalCatalog[locale][key]))
        .map((key) => `${locale}:${key} => ${portalCatalog[locale][key]}`),
    );
    expect(failures).toEqual([]);
  });

  it('keeps translated controlled values connected to every supported enum domain', () => {
    expect(controlledValueDomains).toEqual([
      'role',
      'status',
      'category',
      'timeCategory',
      'expenseCategory',
      'recordType',
      'availability',
      'billingStream',
      'artifactState',
    ]);

    const values: ReadonlyArray<readonly [ControlledValueDomain, string]> = [
      ['timeCategory', 'commissioning'],
      ['timeCategory', 'overtime'],
      ['timeCategory', 'standby'],
      ['timeCategory', 'weekend_holiday'],
      ['timeCategory', 'remote_support'],
      ['timeCategory', 'training'],
      ['timeCategory', 'internal'],
      ['expenseCategory', 'hotel'],
      ['expenseCategory', 'rental_car'],
      ['expenseCategory', 'fuel'],
      ['expenseCategory', 'tolls'],
      ['expenseCategory', 'airfare'],
      ['expenseCategory', 'tools'],
      ['expenseCategory', 'shipping'],
      ['expenseCategory', 'visa_permit'],
      ['role', 'owner_admin'],
      ['role', 'finance_admin'],
      ['role', 'project_manager'],
      ['role', 'auditor_read_only'],
      ['status', 'locked'],
      ['status', 'needs_changes'],
      ['status', 'suspended'],
      ['status', 'offboarded'],
      ['status', 'partially_paid'],
      ['status', 'credited'],
      ['status', 'quarantined'],
      ['recordType', 'technical_change'],
      ['recordType', 'invoice_adjustment'],
      ['recordType', 'settlement'],
      ['recordType', 'reimbursement'],
      ['availability', 'tentative'],
      ['billingStream', 'labor'],
      ['billingStream', 'expense'],
      ['billingStream', 'milestone'],
      ['artifactState', 'processing'],
    ];
    for (const [domain, value] of values) {
      expect(hasControlledValue(domain, value)).toBe(true);
      expect(translateControlledValue('es', domain, value)).not.toBe(value);
      expect(translateControlledValue('pt', domain, value)).not.toBe(value);
    }
  });

  it('renders action message keys through the same locale-aware API as the shell/routes', () => {
    expect(
      renderPortalMessage('es', 'action.billing.accountingPack.failed', { packId: 'abc' }),
    ).toBe('Paquete contable abc con errores.');
    expect(
      renderPortalMessage('pt', 'action.billing.accountingPack.failed', { packId: 'abc' }),
    ).toBe('Pacote contábil abc com falha.');
    expect(renderPortalMessage('es', 'action.error.invalid')).toBe('Los datos no son válidos.');
    expect(portalText('pt', 'action.error.forbidden')).toBe(
      'Você não tem permissão para realizar esta ação.',
    );
    expect(renderPortalMessage('es', 'action.error.stepUpRequired')).toBe(
      'Confirma tu identidad para continuar.',
    );
    expect(renderPortalMessage('en', 'action.error.unauthenticated')).toBe(
      'Sign in again to continue.',
    );
    expect(renderPortalMessage('es', 'action.unknown.code')).not.toBe('action.unknown.code');
    expect(renderPortalMessage('es', 'action.projects.projectUpdated')).toBe(
      'Proyecto actualizado.',
    );
    expect(renderPortalMessage('pt', 'action.projects.projectUpdated')).toBe('Projeto atualizado.');
    expect(renderPortalMessage('es', 'action.validation.projectIdRequired')).toBe(
      'Se requiere el identificador del proyecto.',
    );
    expect(renderPortalMessage('pt', 'action.validation.projectIdRequired')).toBe(
      'O identificador do projeto é obrigatório.',
    );
  });

  it('requires an explicit translation source and rejects mixed-language coverage copy', () => {
    const coverageKeys = [...new Set(PORTAL_COVERAGE_KEYS)];
    const missing = coverageKeys.filter(
      (key) =>
        !isExplicitCoverageTranslation('es', key) || !isExplicitCoverageTranslation('pt', key),
    );
    expect(missing).toEqual([]);

    const EnglishResidue =
      /\b(?:the|and|from|with|this|that|your|every|run|confidence|before|after|only|available|field|work|workspace|daily|action|report|project|worker|record|change|save|delete|source|read|write|verify|continue|sign|secure|password|identity|server|summary|history|details|contains|retained|stream|drafts|customer|copy|update|create|archive|confirm|return|print|generate|preview|language|optional|linked|flag|system|machine|station|line|equipment|tasks|completed|minutes|start|end|date|email|name|description|amount|currency|quantity|period|category|type|basis|unassigned|protected|pending|rejected|issued|paid|overdue|queued|running|ready|failed|blocked|preferred|travel|materials|accommodation|meals|invoice|accounting|document|milestone|labor|processing|locked|suspended|offboarded|paused|closing|restore|credited|quarantined|clean|offline|support|what|why|one|immediately|production|credentials|company|due|workforce|capabilities|scope|through|week|time)\b/i;
    const requiredControlTokens = new Set([
      'Type DELETE, followed by a space and the exact email shown below, to confirm deletion',
    ]);
    const residues = coverageKeys
      .filter((key) => !INVARIANT_TRANSLATION_KEYS.has(key) && !isCoverageInvariantKey(key))
      .filter((key) => !requiredControlTokens.has(key))
      .filter(
        (key) =>
          EnglishResidue.test(portalCatalog.es[key]) || EnglishResidue.test(portalCatalog.pt[key]),
      );
    expect(residues).toEqual([]);

    expect(portalText('es', 'Run every project with confidence.')).toBe(
      'Gestiona cada proyecto con confianza.',
    );
    expect(portalText('pt', 'Run every project with confidence.')).toBe(
      'Gerencie cada projeto com confiança.',
    );
  });

  it('does not treat ordinary translated copy as an accidental English fallback', () => {
    for (const key of portalCatalogKeys) {
      if (INVARIANT_TRANSLATION_KEYS.has(key) || isCoverageInvariantKey(key)) continue;
      expect(portalCatalog.es[key], `English fallback in ES: ${key}`).not.toBe(
        portalCatalog.en[key],
      );
      expect(portalCatalog.pt[key], `English fallback in PT-BR: ${key}`).not.toBe(
        portalCatalog.en[key],
      );
    }
  });

  it('keeps the legacy portalText adapter safe for free text', () => {
    expect(portalText('es', 'Projects')).toBe('Proyectos');
    expect(portalText('pt', 'Projects')).toBe('Projetos');
    expect(portalText('es', 'user-entered-free-text')).toBe('user-entered-free-text');
  });

  it('uses natural localized copy for minute, profile and reporting labels', () => {
    const expected: ReadonlyArray<readonly [string, string, string]> = [
      ['Actual end', 'Fin real', 'Fim real'],
      ['Actual hours', 'Horas reales', 'Horas reais'],
      ['Mon minutes', 'Minutos del lunes', 'Minutos de segunda-feira'],
      ['Tue minutes', 'Minutos del martes', 'Minutos de terça-feira'],
      ['Wed minutes', 'Minutos del miércoles', 'Minutos de quarta-feira'],
      ['Thu minutes', 'Minutos del jueves', 'Minutos de quinta-feira'],
      ['Fri minutes', 'Minutos del viernes', 'Minutos de sexta-feira'],
      ['Sat minutes', 'Minutos del sábado', 'Minutos de sábado'],
      ['Sun minutes', 'Minutos del domingo', 'Minutos de domingo'],
      [
        'Labor budget minutes',
        'Minutos presupuestados de mano de obra',
        'Minutos orçados de mão de obra',
      ],
      ['Planned minutes', 'Minutos planificados', 'Minutos planejados'],
      ['approved minutes', 'minutos aprobados', 'minutos aprovados'],
      [
        'Safety-related change',
        'Cambio relacionado con la seguridad',
        'Alteração relacionada à segurança',
      ],
      ['WORKFORCE PROFILE', 'PERFIL DE PERSONAL', 'PERFIL DA EQUIPE'],
      ['OPERATIONS CONTROL', 'CONTROL DE OPERACIONES', 'CONTROLE DE OPERAÇÕES'],
      ['BILLING PERIOD', 'PERÍODO DE FACTURACIÓN', 'PERÍODO DE FATURAMENTO'],
      [
        'Project period report',
        'Informe del período del proyecto',
        'Relatório do período do projeto',
      ],
      ['Global profile', 'Perfil global', 'Perfil global'],
      ['Log actual time', 'Registrar tiempo real', 'Registrar tempo real'],
      ['Expected minutes / day', 'Minutos previstos / día', 'Minutos esperados / dia'],
      ['Close period start', 'Cerrar el inicio del período', 'Fechar o início do período'],
      ['Close period end', 'Cerrar el final del período', 'Fechar o fim do período'],
      [
        'Fixed per billing period',
        'Fijo por período de facturación',
        'Fixo por período de faturamento',
      ],
    ];
    const residue =
      /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|minutes|period|profile|actual|related|change|billing|workforce|operations|planned|approved|log)\b/i;
    for (const [key, es, pt] of expected) {
      expect(portalText('es', key), `ES ${key}`).toBe(es);
      expect(portalText('pt', key), `PT ${key}`).toBe(pt);
      expect(portalText('es', key), `ES residue ${key}`).not.toMatch(residue);
      expect(portalText('pt', key), `PT residue ${key}`).not.toMatch(residue);
    }
  });

  it('keeps inherited report and action labels natural in ES and PT-BR', () => {
    const expected: ReadonlyArray<readonly [string, string, string]> = [
      ['ACTUAL TIME', 'TIEMPO REAL', 'TEMPO REAL'],
      ['Daily report required', 'Informe diario obligatorio', 'Relatório diário obrigatório'],
      ['PENDING REPORTS', 'INFORMES PENDIENTES', 'RELATÓRIOS PENDENTES'],
      ['PROJECT REPORT', 'INFORME DEL PROYECTO', 'RELATÓRIO DO PROJETO'],
      ['Record expense', 'Registrar gasto', 'Registrar despesa'],
      ['Recorded actual time', 'Tiempo real registrado', 'Tempo real registrado'],
      ['Save daily report', 'Guardar informe diario', 'Salvar relatório diário'],
    ];
    for (const [key, es, pt] of expected) {
      expect(portalText('es', key), `ES ${key}`).toBe(es);
      expect(portalText('pt', key), `PT ${key}`).toBe(pt);
    }
  });

  it('keeps report history verbs semantic for daily, technical and period events', () => {
    const expected: ReadonlyArray<readonly [string, string, string]> = [
      ['daily_report.create', 'Informe diario creado', 'Relatório diário criado'],
      ['daily_report.update', 'Informe diario actualizado', 'Relatório diário atualizado'],
      ['daily_report.delete', 'Informe diario eliminado', 'Relatório diário excluído'],
      ['technical_report.create', 'Informe técnico creado', 'Relatório técnico criado'],
      ['technical_report.update', 'Informe técnico actualizado', 'Relatório técnico atualizado'],
      ['technical_report.delete', 'Informe técnico eliminado', 'Relatório técnico excluído'],
      ['period_report.create', 'Informe del período creado', 'Relatório do período criado'],
      [
        'period_report.update',
        'Informe del período actualizado',
        'Relatório do período atualizado',
      ],
      ['period_report.delete', 'Informe del período eliminado', 'Relatório do período excluído'],
      ['report.daily.report_modified', 'Informe diario actualizado', 'Relatório diário atualizado'],
      [
        'report.technical.report_deleted',
        'Informe técnico eliminado',
        'Relatório técnico excluído',
      ],
    ];
    for (const [action, es, pt] of expected) {
      expect(translateReportHistoryAction('es', action)).toBe(es);
      expect(translateReportHistoryAction('pt', action)).toBe(pt);
      expect(es).not.toContain('Historial de cambios');
      expect(pt).not.toContain('Histórico de alterações');
    }
    expect(translateReportHistoryAction('es', 'project.update')).toBeNull();
  });
});
