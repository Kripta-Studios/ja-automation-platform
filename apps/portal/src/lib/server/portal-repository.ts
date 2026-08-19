import {
  AccessDeniedError,
  ConflictError,
  PortalRepository,
  ReadinessError,
  ValidationError,
  createDatabase,
  V3Repository,
  V3AccessDeniedError,
  V3ConflictError,
  V3ValidationError,
} from '@ja/database';
import { fail } from '@sveltejs/kit';

export function openPortalRepository(locals: App.Locals) {
  if (!locals.user) throw new AccessDeniedError('Sign in required');
  const database = createDatabase();
  try {
    const repository = new PortalRepository(database.sqlite);
    const v3 = new V3Repository(database.sqlite);
    const principal = repository.principalFor(locals.user.id);
    return { ...database, repository, v3, principal };
  } catch (error) {
    database.sqlite.close();
    throw error;
  }
}

export function actionFailure(error: unknown) {
  if (error instanceof AccessDeniedError || error instanceof V3AccessDeniedError)
    return fail(403, { success: false, message: error.message });
  if (error instanceof ConflictError || error instanceof V3ConflictError)
    return fail(409, { success: false, message: error.message });
  if (error instanceof ValidationError || error instanceof V3ValidationError)
    return fail(400, { success: false, message: error.message });
  if (error instanceof ReadinessError)
    return fail(409, { success: false, message: error.message, reasons: error.reasons });
  throw error;
}
