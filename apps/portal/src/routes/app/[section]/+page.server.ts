import type { Actions, PageServerLoad } from './$types';
import { sectionActions } from './section-actions';
import { sectionLoad } from './section-load';

export const load: PageServerLoad = sectionLoad;
export const actions: Actions = sectionActions;
