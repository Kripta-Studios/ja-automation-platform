import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { lifecycle } from './shared.ts';

export const technicalReports = sqliteTable('technical_report', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  authorId: text('author_id').notNull(),
  systemName: text('system_name').notNull(),
  controller: text('controller'),
  changeSummary: text('change_summary').notNull(),
  safetyRelated: integer('safety_related', { mode: 'boolean' }).notNull(),
  validation: text('validation'),
  rollbackPlan: text('rollback_plan'),
  approvalState: text('approval_state').notNull(),
  ...lifecycle,
  plantSite: text('plant_site'),
  areaLine: text('area_line'),
  stationMachine: text('station_machine'),
  systemType: text('system_type'),
  plcPlatform: text('plc_platform'),
  hmiScada: text('hmi_scada'),
  robotPlatform: text('robot_platform'),
  driveMotion: text('drive_motion'),
  networkProtocol: text('network_protocol'),
  softwareVersion: text('software_version'),
  programReference: text('program_reference'),
  productionImpact: text('production_impact'),
  validationResult: text('validation_result'),
  openRisk: text('open_risk'),
  reviewedBy: text('reviewed_by'),
  reviewedAt: text('reviewed_at'),
  reportDate: text('report_date'),
  reportDateProvenance: text('report_date_provenance'),
  version: integer('version').notNull().default(1),
});

export const technicalChanges = sqliteTable('technical_change', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  technicalReportId: text('technical_report_id'),
  authorId: text('author_id').notNull(),
  component: text('component').notNull(),
  originalBehavior: text('original_behavior'),
  rootCause: text('root_cause'),
  changeMade: text('change_made').notNull(),
  reason: text('reason'),
  safetyImpact: integer('safety_impact', { mode: 'boolean' }).notNull(),
  productionImpact: text('production_impact'),
  validation: text('validation'),
  validationResult: text('validation_result'),
  openRisk: text('open_risk'),
  rollbackInformation: text('rollback_information'),
  approvalState: text('approval_state').notNull(),
  version: integer('version').notNull().default(1),
  ...lifecycle,
});

export const projectCloseouts = sqliteTable('project_closeout', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().unique(),
  state: text('state').notNull(),
  snapshotJson: text('snapshot_json').notNull(),
  documentManifestJson: text('document_manifest_json').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  reopenedBy: text('reopened_by'),
  reopenedAt: text('reopened_at'),
  reopenReason: text('reopen_reason'),
});

export const projectCloseoutSeries = sqliteTable('project_closeout_series', {
  id: text('id').primaryKey(), projectId: text('project_id').notNull().unique(),
  currentDraftRevisionId: text('current_draft_revision_id'), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
});
export const projectCloseoutRevisions = sqliteTable('project_closeout_revision', {
  id: text('id').primaryKey(), seriesId: text('series_id').notNull(), revisionNumber: integer('revision_number').notNull(), state: text('state').notNull(),
  internalSnapshotJson: text('internal_snapshot_json').notNull(), clientSnapshotJson: text('client_snapshot_json').notNull(), clientSelectionJson: text('client_selection_json').notNull(),
  internalSnapshotSha256: text('internal_snapshot_sha256').notNull(), clientSnapshotSha256: text('client_snapshot_sha256').notNull(), clientConfirmationHash: text('client_confirmation_hash'),
  clientConfirmedBy: text('client_confirmed_by'), clientConfirmedAt: text('client_confirmed_at'), createdBy: text('created_by').notNull(), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(), finalizedBy: text('finalized_by'), finalizedAt: text('finalized_at'),
});
export const projectCloseoutArtifacts = sqliteTable('project_closeout_artifact', {
  id: text('id').primaryKey(), revisionId: text('revision_id').notNull(), audience: text('audience').notNull(), storageKey: text('storage_key').notNull(), semanticFilename: text('semantic_filename').notNull(), mediaType: text('media_type').notNull(), sha256: text('sha256').notNull(), byteLength: integer('byte_length').notNull(), createdAt: text('created_at').notNull(),
});
