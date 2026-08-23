export const B5_DURABLE_JOB_REGISTRY = Object.freeze([
  Object.freeze({ kind: 'invoice_pdf', capability: 'artifact.invoice.render' }),
  Object.freeze({ kind: 'period_close_report', capability: 'artifact.report.render' }),
  Object.freeze({ kind: 'auto_draft', capability: 'billing.draft.generate' }),
  Object.freeze({
    kind: 'accounting_pack_artifact_render',
    capability: 'artifact.accounting_pack.render',
  }),
  Object.freeze({ kind: 'document_scan', capability: 'document.scan' }),
  Object.freeze({ kind: 'outbox_deliver', capability: 'outbox.deliver' }),
  Object.freeze({ kind: 'alert_dispatch', capability: 'alert.dispatch' }),
  Object.freeze({ kind: 'email_send', capability: 'email.send' }),
  Object.freeze({ kind: 'backup_verify', capability: 'backup.verify' }),
  Object.freeze({
    kind: 'localized_pdf_variant_render',
    capability: 'artifact.localized_pdf.render',
  }),
] as const);

export type B5DurableJobKind = (typeof B5_DURABLE_JOB_REGISTRY)[number]['kind'];
export type B5DurableJobCapability = (typeof B5_DURABLE_JOB_REGISTRY)[number]['capability'];

export type B5DurableJobFixture = Readonly<{
  tenantId: string;
  deploymentId: string;
  serviceActor: Readonly<{
    id: string;
    status: 'active' | 'disabled';
    version: number;
    capabilities: readonly B5DurableJobCapability[];
  }>;
  binding: Readonly<{ actorId: string; version: number; capabilityJson: string }>;
  job: Readonly<{
    id: string;
    kind: B5DurableJobKind;
    capability: B5DurableJobCapability;
    contractVersion: 'b5-v1' | 'legacy';
    state: 'queued' | 'claimed' | 'running' | 'succeeded' | 'dead_letter';
    fenceVersion: number;
    payloadHash: string;
    correlationId: string;
  }>;
  jobRun: Readonly<{
    id: string;
    jobId: string;
    state: 'claimed' | 'running' | 'succeeded' | 'failed' | 'lease_expired';
    fenceVersion: number;
    fencingToken: string;
    actorId: string;
    capability: B5DurableJobCapability;
  }>;
  // This is intentionally a non-financial fixture.  A future accounting-pack producer
  // may be referenced by kind only; no invoice/source/amount entity is constructed here.
  financeEntities: readonly [];
}>;

export function makeB5DurableJobFixture(
  overrides: Readonly<{
    contractVersion?: 'b5-v1' | 'legacy';
    actorStatus?: 'active' | 'disabled';
    fenceVersion?: number;
    runState?: 'claimed' | 'running' | 'succeeded' | 'failed' | 'lease_expired';
    jobState?: 'queued' | 'claimed' | 'running' | 'succeeded' | 'dead_letter';
  }> = {},
): B5DurableJobFixture {
  const tenantId = 'tenant-b5';
  const deploymentId = 'deployment-b5';
  const actorId = 'service-b5';
  const fenceVersion = overrides.fenceVersion ?? 1;
  const registry = B5_DURABLE_JOB_REGISTRY[3];
  const capabilityJson = JSON.stringify([registry.capability]);
  const jobId = 'job-b5-1';
  const jobRunId = 'job-run-b5-1';
  return {
    tenantId,
    deploymentId,
    serviceActor: {
      id: actorId,
      status: overrides.actorStatus ?? 'active',
      version: 1,
      capabilities: [registry.capability],
    },
    binding: { actorId, version: 1, capabilityJson },
    job: {
      id: jobId,
      kind: registry.kind,
      capability: registry.capability,
      contractVersion: overrides.contractVersion ?? 'b5-v1',
      state: overrides.jobState ?? 'claimed',
      fenceVersion,
      payloadHash: 'a'.repeat(64),
      correlationId: 'corr-b5-1',
    },
    jobRun: {
      id: jobRunId,
      jobId,
      state: overrides.runState ?? 'claimed',
      fenceVersion,
      fencingToken: 'fence-token-b5-1',
      actorId,
      capability: registry.capability,
    },
    financeEntities: [],
  };
}

export function durableRegistryMap(): ReadonlyMap<string, string> {
  return new Map(B5_DURABLE_JOB_REGISTRY.map((entry) => [entry.kind, entry.capability]));
}
