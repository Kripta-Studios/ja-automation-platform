import {
  SupplierWorkforceRepository,
  AccessDeniedError,
  V3AccessDeniedError,
  ValidationError,
  V3ValidationError,
} from '@ja/database';
import { error, redirect } from '@sveltejs/kit';
import { openPortalRepository } from './portal-repository';
import { isRealIsoDate } from './iso-date';

export function openSupplierContext(locals: App.Locals) {
  if (!locals.user) redirect(303, '/j-aautomation/app/login');
  if (!locals.session) error(401, 'Sign in required');
  const context = openPortalRepository(locals);
  return { ...context, supplier: new SupplierWorkforceRepository(context.sqlite) };
}

export function supplierReadFailure(caught: unknown): never {
  if (caught instanceof AccessDeniedError || caught instanceof V3AccessDeniedError)
    error(403, 'Supplier workforce access denied');
  if (caught instanceof ValidationError || caught instanceof V3ValidationError)
    error(400, caught.message);
  throw caught;
}

export function supplierPeriod(url: URL) {
  const today = new Date().toISOString().slice(0, 10);
  const from = url.searchParams.get('from') || `${today.slice(0, 7)}-01`;
  const to = url.searchParams.get('to') || today;
  if (!isRealIsoDate(from) || !isRealIsoDate(to) || from > to) error(400, 'Invalid report period');
  return { from, to };
}
