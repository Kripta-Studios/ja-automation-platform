import { resolve } from 'node:path';

export const e2eRoot = resolve(process.cwd());
const runId = `${process.pid}-${Date.now()}`;

export const e2eDatabasePath = resolve(e2eRoot, 'data', `e2e-portal-${runId}.sqlite`);
export const e2eDocumentRoot = resolve(e2eRoot, 'data', `e2e-documents-${runId}`);
