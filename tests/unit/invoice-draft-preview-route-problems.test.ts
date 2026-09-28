import { beforeEach, describe, expect, it, vi } from 'vitest';
import { portalText } from '../../apps/portal/src/lib/portal-i18n';

const state = vi.hoisted(() => ({
  role: 'finance_admin',
  active: true,
  live: true,
  authorized: true,
  found: true,
  rendererFails: false,
  preview: {
    invoice: {
      state: 'draft',
      subtotal_minor: '2000',
      tax_minor: '0',
      total_minor: '2000',
      currency: 'EUR',
      resolved_legal_entity_revision_id: 'revision-1',
      canonical_issuer_name: 'Test Entity',
      canonical_assignment_matches: 1,
      canonical_currency: 'EUR',
    } as Record<string, unknown>,
    lines: [{ subtotal_minor: '2000', description: 'Test line' }] as Record<string, unknown>[],
  },
  open: vi.fn(),
  close: vi.fn(),
  lookup: vi.fn(),
  render: vi.fn(),
}));

vi.mock('@ja/database', async (importOriginal) => {
  const original = await importOriginal<typeof import('@ja/database')>();
  return {
    ...original,
    assertLiveSession: () => {
      if (!state.live) throw new original.AccessDeniedError('Live authenticated session required');
    },
  };
});
vi.mock('$lib/server/portal-repository', async () => {
  const { AccessDeniedError, ValidationError } = await import('@ja/database');
  return {
    openPortalRepository: () => {
      state.open();
      if (!state.active) throw new AccessDeniedError('Active account required');
      return {
        sqlite: { close: state.close },
        principal: { role: state.role, userId: 'user-1', sessionId: 'session-1' },
        repository: {
          invoicePreview: (...args: unknown[]) => {
            state.lookup(...args);
            if (!state.authorized) throw new AccessDeniedError('Finance role required');
            if (!state.found) throw new ValidationError('Invoice not found');
            return state.preview;
          },
        },
      };
    },
  };
});
vi.mock('@ja/reporting', () => ({
  invoicePdf: (...args: unknown[]) => {
    state.render(...args);
    if (state.rendererFails) throw new Error('private renderer details');
    return new TextEncoder().encode('%PDF-1.4\n%%EOF');
  },
}));

import { GET } from '../../apps/portal/src/routes/app/api/invoices/[id]/draft-preview/+server';

function event(signedIn = true, id = 'invoice-1', lang = 'en') {
  return {
    locals: {
      user: signedIn ? { id: 'user-1' } : null,
      session: signedIn ? { id: 'session-1' } : null,
      correlationId: 'invoice-preview-reference-123',
    },
    params: { id },
    url: new URL(`http://localhost/app/api/invoices/${id}/draft-preview?lang=${lang}`),
  } as never;
}

async function request(signedIn = true, id = 'invoice-1', lang = 'en'): Promise<Response> {
  return (await GET(event(signedIn, id, lang))) as Response;
}

async function problem(signedIn = true, id = 'invoice-1') {
  const response = await request(signedIn, id);
  expect(response.headers.get('content-type')).toContain('application/problem+json');
  expect(response.headers.get('content-disposition')).toBeNull();
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  const body = await response.json();
  expect(body).toMatchObject({
    success: false,
    correlationId: 'invoice-preview-reference-123',
    params: expect.any(Object),
    fieldErrors: expect.any(Object),
    remedies: expect.any(Array),
  });
  return { response, body };
}

describe('invoice draft preview problem boundary', () => {
  beforeEach(() => {
    state.role = 'finance_admin';
    state.active = true;
    state.live = true;
    state.authorized = true;
    state.found = true;
    state.rendererFails = false;
    state.preview.invoice = {
      state: 'draft',
      subtotal_minor: '2000',
      tax_minor: '0',
      total_minor: '2000',
      currency: 'EUR',
      resolved_legal_entity_revision_id: 'revision-1',
      canonical_issuer_name: 'Test Entity',
      canonical_assignment_matches: 1,
      canonical_currency: 'EUR',
    };
    state.preview.lines = [{ subtotal_minor: '2000', description: 'Test line' }];
    for (const fn of [state.open, state.close, state.lookup, state.render]) fn.mockClear();
  });

  it('authorizes sign-in, session, account, role and invoice before disclosing state', async () => {
    expect((await problem(false)).body.code).toBe('INVOICE_DRAFT_PREVIEW_SIGN_IN_REQUIRED');
    expect(state.open).not.toHaveBeenCalled();
    state.live = false;
    expect((await problem()).body.code).toBe('INVOICE_DRAFT_PREVIEW_SESSION_EXPIRED');
    expect(state.lookup).not.toHaveBeenCalled();
    state.live = true;
    state.active = false;
    expect((await problem()).body.code).toBe('INVOICE_DRAFT_PREVIEW_ACCOUNT_DISABLED');
    state.active = true;
    state.role = 'worker';
    state.authorized = false;
    expect((await problem()).body.code).toBe('INVOICE_DRAFT_PREVIEW_ACCESS_DENIED');
    state.authorized = true;
    state.found = false;
    expect((await problem()).body.code).toBe('INVOICE_DRAFT_PREVIEW_INVOICE_UNAVAILABLE');
    expect(state.render).not.toHaveBeenCalled();
  });

  it('maps a changed invoice state and empty lines without rendering a PDF', async () => {
    state.preview.invoice.state = 'issued';
    const changed = await problem();
    expect(changed.response.status).toBe(409);
    expect(changed.body).toMatchObject({
      code: 'INVOICE_DRAFT_PREVIEW_STATE_UNAVAILABLE',
      params: { status: 'issued' },
      remedies: [{ id: 'review_invoice', recordId: 'invoice-1' }],
    });
    state.preview.invoice.state = 'draft';
    state.preview.lines = [];
    expect((await problem()).body.code).toBe('INVOICE_DRAFT_PREVIEW_LINES_MISSING');
    expect(state.render).not.toHaveBeenCalled();
  });

  it.each([
    ['subtotal_minor', 'invalid', 'AMOUNT_INVALID'],
    ['subtotal_minor', '3000', 'SUBTOTAL_MISMATCH'],
    ['resolved_legal_entity_revision_id', null, 'ISSUER_MISSING'],
    ['canonical_assignment_matches', 0, 'ISSUER_NOT_EFFECTIVE'],
    ['canonical_currency', 'USD', 'CURRENCY_MISMATCH'],
  ])('maps %s=%s to %s', async (field, value, suffix) => {
    state.preview.invoice[field] = value;
    const { response, body } = await problem();
    expect(response.status).toBe(409);
    expect(body.code).toBe(`INVOICE_DRAFT_PREVIEW_${suffix}`);
    expect(body.messageKey).toMatch(/^problem\.invoiceDraftPreview\./u);
    expect(body.remedies[0].id).toBe(
      suffix.startsWith('ISSUER_') || suffix === 'CURRENCY_MISMATCH'
        ? 'contact_owner'
        : 'review_invoice',
    );
    expect(state.render).not.toHaveBeenCalled();
  });

  it('offers issuer configuration only to an owner', async () => {
    state.role = 'owner_admin';
    state.preview.invoice.canonical_currency = 'USD';
    expect((await problem()).body.remedies).toEqual([{ id: 'review_legal_entity' }]);
  });

  it('returns a real PDF for a valid draft and a safe referenced failure on renderer error', async () => {
    const pdf = await request(true, 'invoice-1', 'pt');
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get('content-type')).toBe('application/pdf');
    expect(pdf.headers.get('content-disposition')).toContain('draft-preview-invoice-1-pt.pdf');
    expect((await pdf.text()).startsWith('%PDF-')).toBe(true);
    expect(state.render).toHaveBeenCalledOnce();
    state.rendererFails = true;
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const failed = await problem();
      expect(failed.response.status).toBe(503);
      expect(failed.body.code).toBe('INVOICE_DRAFT_PREVIEW_UNAVAILABLE');
      expect(failed.body.message).not.toContain('private renderer details');
      expect(log).toHaveBeenCalledWith('Unexpected invoice draft preview failure', {
        correlationId: 'invoice-preview-reference-123',
        cause: expect.any(Error),
      });
    } finally {
      log.mockRestore();
    }
  });

  it('resolves every route message key in English, Spanish and Portuguese', async () => {
    const cases: Array<() => Promise<unknown>> = [
      async () => (await problem(false)).body,
      async () => {
        state.live = false;
        return (await problem()).body;
      },
      async () => {
        state.active = false;
        return (await problem()).body;
      },
      async () => {
        state.authorized = false;
        return (await problem()).body;
      },
      async () => {
        state.found = false;
        return (await problem()).body;
      },
      async () => {
        state.preview.invoice.state = 'issued';
        return (await problem()).body;
      },
      async () => {
        state.preview.lines = [];
        return (await problem()).body;
      },
      async () => {
        state.preview.invoice.subtotal_minor = 'invalid';
        return (await problem()).body;
      },
      async () => {
        state.preview.invoice.subtotal_minor = '3000';
        return (await problem()).body;
      },
      async () => {
        state.preview.invoice.resolved_legal_entity_revision_id = null;
        return (await problem()).body;
      },
      async () => {
        state.preview.invoice.canonical_assignment_matches = 0;
        return (await problem()).body;
      },
      async () => {
        state.preview.invoice.canonical_currency = 'USD';
        return (await problem()).body;
      },
      async () => {
        state.rendererFails = true;
        const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
          return (await problem()).body;
        } finally {
          log.mockRestore();
        }
      },
    ];
    for (const run of cases) {
      const result = await run();
      const body = result as { messageKey: string; params: Record<string, string> };
      for (const locale of ['en', 'es', 'pt'] as const) {
        const text = portalText(locale, body.messageKey, body.params);
        expect(text, `${locale}: ${body.messageKey}`).not.toBe(body.messageKey);
        expect(text).not.toContain('{status}');
        expect(text).not.toContain('{correlationId}');
      }
      state.live = true;
      state.active = true;
      state.authorized = true;
      state.found = true;
      state.rendererFails = false;
      state.preview.invoice = {
        state: 'draft',
        subtotal_minor: '2000',
        tax_minor: '0',
        total_minor: '2000',
        currency: 'EUR',
        resolved_legal_entity_revision_id: 'revision-1',
        canonical_issuer_name: 'Test Entity',
        canonical_assignment_matches: 1,
        canonical_currency: 'EUR',
      };
      state.preview.lines = [{ subtotal_minor: '2000', description: 'Test line' }];
    }
  });
});
