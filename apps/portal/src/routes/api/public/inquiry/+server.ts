import { contactSchema } from '@ja/schemas';
import type { RequestHandler } from './$types';
import { acceptPublicForm } from '$lib/server/public-form';

export const POST: RequestHandler = (event) =>
  acceptPublicForm(event, 'project-inquiry', contactSchema);
