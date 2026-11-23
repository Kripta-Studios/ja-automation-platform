import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { errorPageText, sectionLabelKey } from '../../apps/portal/src/lib/portal/error-page-copy';
import { isDocumentNavigation } from '../../apps/portal/src/lib/server/document-navigation';

describe('in-app 403/404 page (T18)', () => {
  it('names the section of the refused URL instead of "Portal"', () => {
    expect(sectionLabelKey('/pay')).toBe('My Pay');
    expect(sectionLabelKey('/j-aautomation/app/finance')).toBe('Money');
    expect(sectionLabelKey('/j-aautomation/app/audit?view=all')).toBe('Audit log');
    expect(sectionLabelKey('/crew/time/x')).toBe('Crew hours');
    expect(sectionLabelKey('/approvals')).toBe('Approvals');
    expect(sectionLabelKey('/j-aautomation/app/unknown-thing')).toBeNull();
  });

  it('has its own 404 wording and coordinator-specific My Pay copy in EN/ES/PT', () => {
    expect(errorPageText('en', 'notFoundTitle')).toBe('Page not found');
    expect(errorPageText('es', 'notFoundTitle')).toBe('Página no encontrada');
    expect(errorPageText('pt', 'notFoundTitle')).toBe('Página não encontrada');
    for (const locale of ['en', 'es', 'pt'] as const) {
      expect(errorPageText(locale, 'notFoundBody')).not.toMatch(/search|búsqueda|busca/iu);
      expect(errorPageText(locale, 'payCoordinator')).not.toMatch(/coordinator|coordinador|coordenador/iu);
    }
    expect(errorPageText('en', 'contact', { name: 'Antonny Nascimento' })).toBe(
      'Contact Antonny Nascimento',
    );
  });

  it('treats only a browser navigation as a document request', () => {
    const request = (headers: Record<string, string>) =>
      new Request('http://localhost/j-aautomation/app/profile/password', { headers });
    expect(isDocumentNavigation(request({ 'sec-fetch-mode': 'navigate', accept: 'text/html' }))).toBe(true);
    expect(isDocumentNavigation(request({ 'sec-fetch-mode': 'cors', accept: 'text/html' }))).toBe(false);
    expect(isDocumentNavigation(request({ accept: 'text/html,application/xhtml+xml' }))).toBe(true);
    expect(isDocumentNavigation(request({ accept: '*/*' }))).toBe(false);
  });

  it('renders refusals inside the app shell and gates the restricted page and unknown URLs', () => {
    const layout = readFileSync(resolve('apps/portal/src/routes/app/+layout.svelte'), 'utf8');
    expect(layout).toMatch(/Boolean\(\$page\.error\)/u);
    const restricted = readFileSync(
      resolve('apps/portal/src/routes/app/restricted/+page.server.ts'),
      'utf8',
    );
    expect(restricted).toContain("error(403, 'operational.route_restricted')");
    const catchAll = readFileSync(
      resolve('apps/portal/src/routes/app/[...rest]/+page.server.ts'),
      'utf8',
    );
    expect(catchAll).toContain('error(404');
    const crew = readFileSync(resolve('apps/portal/src/routes/app/crew/+page.server.ts'), 'utf8');
    expect(crew).toContain("error(403, 'crew.chief_required')");
  });

  it('sends a browser that opens an unavailable private document to the styled 404', () => {
    const endpoint = readFileSync(
      resolve('apps/portal/src/routes/app/documents/[id]/+server.ts'),
      'utf8',
    );
    expect(endpoint).toMatch(/isDocumentNavigation\(request\)/u);
    expect(endpoint).toContain('/j-aautomation/app/document-unavailable?from=');
    const page = readFileSync(
      resolve('apps/portal/src/routes/app/document-unavailable/+page.server.ts'),
      'utf8',
    );
    expect(page).toContain("error(404, 'document.unavailable')");
    expect(sectionLabelKey('/documents/01a0')).toBe('Documents');
  });
});
