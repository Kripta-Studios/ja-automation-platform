import { open, submitDraftReports } from './seed-lib.mjs';
const s = await open('crew-chief');
await submitDraftReports(s.page, 'technical');
await s.close();
