import {
  AccessDeniedError,
  ConflictError,
  PortalRepository,
  ReadinessError,
  ValidationError,
  createDatabase,
} from '@ja/database';
import { fail } from '@sveltejs/kit';

export function openPortalRepository(locals: App.Locals) {
  if (!locals.user) throw new AccessDeniedError('Sign in required');
  const database = createDatabase();
  try {
    const repository = new PortalRepository(database.sqlite);
    const principal = repository.principalFor(locals.user.id);
    return { ...database, repository, principal };
  } catch (error) {
    database.sqlite.close();
    throw error;
  }
}

export function actionFailure(error: unknown) {
  if (error instanceof AccessDeniedError)
    return fail(403, { success: false, message: error.message });
  if (error instanceof ConflictError) return fail(409, { success: false, message: error.message });
  if (error instanceof ValidationError)
    return fail(400, { success: false, message: error.message });
  if (error instanceof ReadinessError)
    return fail(409, { success: false, message: error.message, reasons: error.reasons });
  throw error;
}
