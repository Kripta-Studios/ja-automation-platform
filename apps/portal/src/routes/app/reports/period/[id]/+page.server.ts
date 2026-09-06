import { accountingPackPeriodSchema, uuidSchema } from '@ja/schemas';
import { error, redirect } from '@sveltejs/kit';
import { createHash } from 'node:crypto';
import { relative, resolve } from 'node:path';
import { z } from 'zod';
import { actionFail, actionFailure, actionSuccess } from '$lib/server/actions/action-message';
import { openPortalRepository } from '$lib/server/portal-repository';
import { formObject, privateDocumentSignature } from '$lib/server/action-utils';
import {
  removePrivateFileIfPresent,
  writePrivateFileExclusive,
} from '$lib/server/private-artifact-access';
import { assertRegularPrivateFile } from '$lib/server/report-attachment-route';
import type { Actions, PageServerLoad } from './$types';

const signatureDateIssue = 'Signature date must be a real date not in the future';
const signatureDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .superRefine((value, ctx) => {
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0));
    if (
      parsed.toISOString().slice(0, 10) !== value ||
      value > new Date().toISOString().slice(0, 10)
    )
      ctx.addIssue({
        code: 'custom',
        message: signatureDateIssue,
      });
  });

export const load: PageServerLoad = ({ locals, params }) => {
  if (!locals.user) redirect(303, '/j-aautomation/app/login');
  const context = openPortalRepository(locals);
  try {
    const report = context.v3.periodReportSnapshot(context.principal, params.id);
    const metadata = context.v3
      .listPeriodReports(context.principal)
      .find((row) => String(row.id) === params.id);
    let pdfReady = false;
    const conformity =
      locals.user.role === 'worker'
        ? null
        : context.v3.getCustomerConformityForPeriodReport(context.principal, params.id);
    try {
      context.v3.periodReportPdfMetadata(context.principal, params.id);
      pdfReady = true;
    } catch {
      pdfReady = false;
    }
    return {
      user: locals.user,
      report: {
        ...report,
        id: params.id,
        state: metadata?.state ?? 'review',
        snapshotVersion: metadata?.snapshot_version ?? null,
        snapshotSha256: metadata?.snapshot_sha256 ?? null,
        pdfReady,
        conformity,
      },
    };
  } catch {
    error(404, 'detail.periodReport.notFound');
  } finally {
    context.sqlite.close();
  }
};

export const actions: Actions = {
  approve: async ({ locals, request, params }) => {
    const parsed = z
      .object({
        expectedSnapshotVersion: z.coerce.number().int().positive(),
        expectedSnapshotSha256: z.string().regex(/^[a-f0-9]{64}$/u),
      })
      .strict()
      .safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.periodReportApproval',
        {},
        'Valid period report snapshot binding is required',
      );
    const context = openPortalRepository(locals);
    try {
      const approved = context.v3.approvePeriodReport(context.principal, {
        periodReportId: params.id,
        ...parsed.data,
      });
      return actionSuccess(
        approved.changed
          ? 'action.reports.periodReportApproved'
          : 'action.reports.periodReportAlreadyApproved',
        {
          reportId: approved.id,
          snapshotVersion: approved.snapshotVersion,
        },
        approved.changed
          ? 'Period report approved for customer conformity'
          : 'Period report was already approved for this snapshot version',
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  sign: async ({ locals, request, params }) => {
    const object = await formObject(request);
    const pendingEvidence = z.string().uuid().safeParse(object.pendingSignatureDocumentId);
    const pendingSignatureDocumentId = pendingEvidence.success ? pendingEvidence.data : null;
    const attachment = z
      .object({
        conformityId: z.string().trim().min(1).max(200),
        reason: z.string().trim().min(1).max(2000),
      })
      .strict()
      .safeParse({
        conformityId: object.conformityId,
        reason: object.reason,
      });
    const attachmentRequested = object.conformityId !== undefined || object.reason !== undefined;
    const parsed = z
      .object({
        signerName: z.string().trim().min(1).max(200),
        signerIdentity: z.string().trim().max(320).optional(),
        signatureDate: signatureDateSchema,
      })
      .strict()
      .safeParse({
        signerName: object.signerName,
        signatureDate: object.signatureDate,
        ...(object.signerIdentity ? { signerIdentity: object.signerIdentity } : {}),
      });
    if ((attachmentRequested && !attachment.success) || (!attachmentRequested && !parsed.success))
      return actionFail(400, 'action.validation.customerSignoff', {}, 'Signer name is required');
    const signedCopy = object.signatureFile;
    let bytes: Uint8Array | null = null;
    if (!pendingSignatureDocumentId) {
      if (
        !(signedCopy instanceof File) ||
        signedCopy.size < 1 ||
        signedCopy.size > 20_000_000 ||
        signedCopy.type !== 'application/pdf'
      )
        return actionFail(
          400,
          'action.validation.customerSignoff',
          {},
          'A signed PDF copy up to 20 MB is required',
        );
      bytes = new Uint8Array(await signedCopy.arrayBuffer());
      const trailer = new TextDecoder('latin1').decode(
        bytes.slice(Math.max(0, bytes.length - 1024)),
      );
      if (!privateDocumentSignature(signedCopy.type, bytes) || !trailer.includes('%%EOF'))
        return actionFail(
          400,
          'action.validation.customerSignoff',
          {},
          'The signed-copy file must be a complete PDF',
        );
    }
    const context = openPortalRepository(locals);
    let reservationId: string | null = null;
    let storageKey: string | null = null;
    let storageFileCreated = false;
    let finalized = false;
    let conformityRecorded = false;
    let preservePendingEvidence = false;
    try {
      const projectId = String(
        (
          context.v3.periodReportSnapshot(context.principal, params.id) as {
            project?: { id?: unknown };
          }
        )?.project?.id ?? '',
      );
      const reportBinding = context.v3
        .listPeriodReports(context.principal)
        .find((report) => String(report.id) === params.id);
      const snapshotVersion = Number(reportBinding?.snapshot_version);
      const snapshotSha256 = String(reportBinding?.snapshot_sha256 ?? '');
      if (
        !Number.isInteger(snapshotVersion) ||
        snapshotVersion < 1 ||
        !/^[a-f0-9]{64}$/u.test(snapshotSha256)
      )
        throw new Error('Customer report snapshot binding is unavailable');
      if (pendingSignatureDocumentId) {
        reservationId = pendingSignatureDocumentId;
        finalized = true;
      } else {
        if (!(signedCopy instanceof File) || !bytes)
          throw new Error('Signed-copy validation was not completed');
        const reservation = context.v3.reserveUpload(context.principal, {
          projectId,
          originalFilename: signedCopy.name,
          artifactType: 'customer_signoff_evidence',
          description: JSON.stringify({
            kind: 'customer_signoff_evidence_binding_v1',
            periodReportId: params.id,
            snapshotVersion,
            snapshotSha256,
          }),
          sensitivity: 'customer_private',
        });
        reservationId = reservation.reservationId;
        storageKey = reservation.storageKey;
        const root = resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
        const target = resolve(root, storageKey);
        const pathWithinRoot = relative(root, target);
        if (
          !pathWithinRoot ||
          pathWithinRoot.split(/[\\/]/u).includes('..') ||
          pathWithinRoot.startsWith('/') ||
          pathWithinRoot.startsWith('\\')
        )
          throw new Error('Invalid private signed-copy path');
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        try {
          await writePrivateFileExclusive(root, storageKey, bytes);
          storageFileCreated = true;
        } catch (cause) {
          if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause;
          await assertRegularPrivateFile(
            root,
            storageKey,
            sha256,
            bytes.byteLength,
            'application/pdf',
          );
        }
        context.v3.finalizeUpload(context.principal, reservationId, {
          sha256,
          mediaType: 'application/pdf',
          byteLength: bytes.byteLength,
        });
        finalized = true;
      }
      const signatureDocumentId = pendingSignatureDocumentId ?? reservationId;
      let signed;
      if (attachment.success) {
        signed = context.v3.attachLegacyCustomerConformityEvidence(context.principal, {
          expectedPeriodReportId: params.id,
          conformityId: attachment.data.conformityId,
          signatureDocumentId,
          reason: attachment.data.reason,
        });
      } else {
        // The classifier above already returns a localized 400 for this
        // branch. Keep the local guard so TypeScript and future changes cannot
        // turn a malformed attachment request into a new acceptance.
        if (!parsed.success)
          return actionFail(
            400,
            'action.validation.customerSignoff',
            {},
            'Signer name is required',
          );
        signed = context.v3.recordCustomerConformity(context.principal, {
          periodReportId: params.id,
          signatureDocumentId,
          signerName: parsed.data.signerName,
          ...(parsed.data.signerIdentity ? { signerIdentity: parsed.data.signerIdentity } : {}),
          signedAt: `${parsed.data.signatureDate}T00:00:00.000Z`,
        });
      }
      conformityRecorded = true;
      return actionSuccess(
        attachment.success
          ? 'action.reports.customerSignoffEvidenceAttached'
          : 'action.reports.customerSignoffRecorded',
        { conformityId: signed.id },
        attachment.success
          ? 'Verified signed-copy evidence attached to this historical immutable conformity'
          : 'Verified signed-copy evidence recorded against this immutable report version',
      );
    } catch (error) {
      const pending = reservationId
        ? (context.sqlite
            .prepare(
              `SELECT project_id,owner_id,state,scan_status,artifact_type
                 FROM document WHERE id=?`,
            )
            .get(reservationId) as
            | {
                project_id: string | null;
                owner_id: string;
                state: string;
                scan_status: string | null;
                artifact_type: string | null;
              }
            | undefined)
        : undefined;
      const expectedProjectId = String(
        (
          context.v3.periodReportSnapshot(context.principal, params.id) as {
            project?: { id?: unknown };
          }
        )?.project?.id ?? '',
      );
      if (
        pending?.project_id === expectedProjectId &&
        pending.owner_id === context.principal.userId &&
        pending.state === 'quarantined' &&
        pending.scan_status === 'pending' &&
        pending.artifact_type === 'customer_signoff_evidence'
      ) {
        preservePendingEvidence = true;
        return actionFail(
          409,
          'action.error.conflict',
          {},
          'The signed PDF is awaiting its security scan. Retry after the scan completes.',
          {
            scanPending: true,
            pendingSignatureDocumentId: reservationId,
            ...(parsed.success ? parsed.data : {}),
            ...(attachment.success ? attachment.data : {}),
          },
        );
      }
      return actionFailure(error);
    } finally {
      if (reservationId && !finalized) {
        try {
          context.v3.cancelUploadReservation(context.principal, reservationId);
        } catch {
          // Preserve the action error; scheduled reservation cleanup handles a
          // rare failed cancellation without deleting a possibly valid file.
        }
      }
      if (storageFileCreated && storageKey && !finalized) {
        const root = resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents');
        await removePrivateFileIfPresent(root, storageKey).catch(() => undefined);
      }
      if (
        storageFileCreated &&
        storageKey &&
        reservationId &&
        finalized &&
        !conformityRecorded &&
        !preservePendingEvidence
      ) {
        try {
          const discarded = context.v3.discardUnboundCustomerSignoffEvidence(
            context.principal,
            reservationId,
          );
          await removePrivateFileIfPresent(
            resolve(process.env.JA_DOCUMENT_ROOT ?? 'data/documents'),
            discarded.storageKey,
          );
        } catch {
          // A quarantine, scanner transition, download, or concurrent conformity
          // reference makes deletion unsafe; preserve the private artifact.
        }
      }
      context.sqlite.close();
    }
  },
  invalidateSignoff: async ({ locals, request }) => {
    const parsed = z
      .object({
        conformityId: z.string().trim().min(1).max(200),
        reason: z.string().trim().min(1).max(2000),
      })
      .strict()
      .safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.customerSignoffInvalidation',
        {},
        'Conformity and invalidation reason are required',
      );
    const context = openPortalRepository(locals);
    try {
      const invalidated = context.v3.invalidateCustomerConformity(context.principal, parsed.data);
      return actionSuccess(
        'action.reports.customerSignoffInvalidated',
        { conformityId: invalidated.conformityId },
        'Customer sign-off invalidated; the immutable signed record was retained',
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
  refresh: async ({ locals, request }) => {
    const parsed = accountingPackPeriodSchema
      .extend({ projectId: uuidSchema })
      .safeParse(await formObject(request));
    if (!parsed.success)
      return actionFail(
        400,
        'action.validation.projectReportingPeriod',
        {},
        'Project and reporting period are required',
      );
    const context = openPortalRepository(locals);
    try {
      const reports = context.v3.refreshPeriodReports(context.principal, {
        ...parsed.data,
      });
      const queued = context.v3.enqueueJob(
        'period_close_report',
        `period-report-refresh:${parsed.data.projectId}:${parsed.data.periodStart}:${parsed.data.periodEnd}:${parsed.data.reportLocale}`,
        parsed.data,
      );
      return actionSuccess(
        'action.reports.periodReportsRefreshed',
        {
          reports: reports.length,
          jobId: queued.id,
          jobCreated: queued.created,
          jobState: 'queued',
        },
        `${reports.length} report snapshots recalculated from the current source data and queued for rendering`,
      );
    } catch (error) {
      return actionFailure(error);
    } finally {
      context.sqlite.close();
    }
  },
};
