import { contactSchema, supportSchema } from '@ja/schemas';
import type { RequestHandler } from './$types';
import { acceptPublicForm } from '$lib/server/public-form';
export const POST: RequestHandler = async (event) => {
  const body = await event.request
    .clone()
    .json()
    .catch(() => ({}));
  return acceptPublicForm(
    event,
    body.kind === 'support' ? 'support' : 'contact',
    body.kind === 'support' ? supportSchema : contactSchema,
  );
};
