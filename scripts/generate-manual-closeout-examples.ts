/** Create authentic closeout ZIP examples through the repository lifecycle in a fresh disposable DB. */
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { technicalReportPdf } from '@ja/reporting';
import {
  createB5LifecycleSecurityFixture,
  closeB5LifecycleSecurityFixture,
  stepUpB5Principal,
} from '../tests/fixtures/b5-lifecycle-security-fixture.ts';

const output = resolve('docs/manuals/examples/closeout');
mkdirSync(output, { recursive: true });
const fixture = createB5LifecycleSecurityFixture();
const storage = mkdtempSync(resolve(tmpdir(), 'ja-example-closeout-files-'));
const previousRoot = process.env.JA_DOCUMENT_ROOT;
process.env.JA_DOCUMENT_ROOT = storage;
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
try {
  const { sqlite, repository, v3 } = fixture;
  // Only this freshly-created /tmp fixture is changed. No deployed DB is opened.
  sqlite
    .prepare('UPDATE user SET name=? WHERE id=?')
    .run('Example Administrator', fixture.owner.userId);
  for (const row of sqlite.prepare("SELECT id FROM user WHERE role<>'owner_admin'").all()) {
    sqlite
      .prepare('UPDATE user SET name=?,email=? WHERE id=?')
      .run(
        row.id === fixture.worker.userId ? 'Alex Rivera — EXAMPLE' : 'Example Administrator',
        `${String(row.id)}@example.invalid`,
        row.id,
      );
  }
  sqlite
    .prepare(
      'UPDATE client SET legal_name=?,display_name=?,billing_email=?,billing_address=? WHERE id=?',
    )
    .run(
      'Example Manufacturing Ltd — EXAMPLE',
      'Example Manufacturing',
      'billing@example.invalid',
      'Example address, fictional location',
      fixture.client.id,
    );
  sqlite
    .prepare('UPDATE project SET project_number=?,name=?,notes=? WHERE id=?')
    .run(
      'EXAMPLE-P-002',
      'EXAMPLE — completed line handover',
      'Synthetic demonstration; no customer or production data.',
      fixture.project.id,
    );
  const owner = stepUpB5Principal(
    sqlite,
    repository.principalFor(fixture.owner.userId),
    'manual-example',
  );
  for (const workDate of ['2026-09-01', '2026-09-02']) {
    const time = repository.createTimeEntry(fixture.worker, {
      projectId: fixture.project.id,
      workDate,
      category: 'regular',
      minutes: 480,
      startTime: '08:00',
      endTime: '16:30',
      breakMinutes: 30,
      summary: 'EXAMPLE — operational validation and handover',
    });
    repository.submitTime(fixture.worker, time.id, time.version);
    repository.operationalApproveTime(owner, time.id, 'approved');
  }
  const input = {
    projectId: fixture.project.id,
    reportDate: '2026-09-02',
    systemName: 'EXAMPLE conveyor controller',
    changeSummary: 'EXAMPLE — validated sensor sequence and documented the handover.',
    safetyRelated: false,
    productionImpact: 'Offline demonstration only.',
    validation: 'Simulated sequence completed as expected.',
    validationResult: 'Passed simulation.',
    openRisk: 'No open item in this synthetic example.',
    rollbackPlan: 'Restore the example baseline.',
  };
  const technical = repository.createTechnicalReport(fixture.worker, input);
  repository.submitReport(fixture.worker, 'technical', technical.id, technical.version);
  repository.reviewReport(owner, 'technical', technical.id, 'approved');
  const pdf = technicalReportPdf({
    ...input,
    locale: 'en',
    project: { number: 'EXAMPLE-P-002', name: 'EXAMPLE — completed line handover' },
    author: 'Alex Rivera — EXAMPLE',
    approvalState: 'approved',
  });
  const document = v3.reserveUpload(owner, {
    projectId: fixture.project.id,
    originalFilename: 'EXAMPLE-technical-handover.pdf',
    artifactType: 'technical_reference',
    sensitivity: 'customer_private',
    description: 'Synthetic operational handover reference.',
  });
  const path = resolve(storage, document.storageKey);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, pdf, { flag: 'wx' });
  v3.finalizeUpload(owner, document.reservationId, {
    sha256: sha256(pdf),
    mediaType: 'application/pdf',
    byteLength: pdf.byteLength,
  });
  const draft = repository.prepareProjectCloseout(owner, {
    projectId: fixture.project.id,
    clientDocumentIds: [document.reservationId],
  });
  repository.confirmProjectCloseoutClientPublication(owner, draft.id, draft.clientSnapshotHash);
  const artifacts = repository.finalizeProjectCloseoutRevision(owner, draft.id) as Array<{
    id: string;
    audience: 'client' | 'internal';
  }>;
  const files = artifacts.map((artifact) => {
    const download = repository.downloadProjectCloseoutArtifact(owner, artifact.id);
    const filename = `EXAMPLE-P-002-closeout-${artifact.audience}-r1.zip`;
    writeFileSync(resolve(output, filename), download.bytes);
    return {
      id: `closeout-${artifact.audience}`,
      family: 'project-closeout',
      format: 'zip',
      locale: 'en',
      file: `closeout/${filename}`,
      renderer: 'ProjectCloseoutService.prepare/confirmClientPublication/finalize/download',
      description: `${artifact.audience} project closeout; authentic frozen ZIP with JSON, PDF summary, document index and selected synthetic reference.`,
      sha256: sha256(download.bytes),
      bytes: download.bytes.byteLength,
    };
  });
  const finalAgain = repository.finalizeProjectCloseoutRevision(owner, draft.id) as Array<{
    id: string;
  }>;
  if (finalAgain.length !== 2) throw Error('Closeout idempotency failed');
  for (const artifact of artifacts) {
    const bytes = repository.downloadProjectCloseoutArtifact(owner, artifact.id).bytes;
    if (sha256(bytes) !== files.find((file) => file.id === `closeout-${artifact.audience}`)?.sha256)
      throw Error('Finalized closeout bytes changed');
  }
  writeFileSync(
    resolve(output, '../manifest-closeout.json'),
    JSON.stringify(
      { synthetic: true, source: 'fresh isolated repository lifecycle', artifacts: files },
      null,
      2,
    ) + '\n',
  );
  console.log(JSON.stringify(files, null, 2));
} finally {
  closeB5LifecycleSecurityFixture(fixture);
  rmSync(storage, { recursive: true, force: true });
  if (previousRoot === undefined) delete process.env.JA_DOCUMENT_ROOT;
  else process.env.JA_DOCUMENT_ROOT = previousRoot;
}
