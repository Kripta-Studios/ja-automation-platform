import { demoEnabled } from '$lib/server/demo-session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ demoEnabled });
