BEGIN IMMEDIATE;

ALTER TABLE daily_report ADD COLUMN site_shift TEXT;
ALTER TABLE daily_report ADD COLUMN tasks_completed TEXT;
ALTER TABLE daily_report ADD COLUMN problems_found TEXT;
ALTER TABLE daily_report ADD COLUMN corrective_actions TEXT;
ALTER TABLE daily_report ADD COLUMN client_decisions TEXT;
ALTER TABLE daily_report ADD COLUMN downtime_minutes INTEGER NOT NULL DEFAULT 0 CHECK(downtime_minutes >= 0);
ALTER TABLE daily_report ADD COLUMN standby_reason TEXT;
ALTER TABLE daily_report ADD COLUMN blockers TEXT;
ALTER TABLE daily_report ADD COLUMN open_items TEXT;
ALTER TABLE daily_report ADD COLUMN next_day_plan TEXT;
ALTER TABLE daily_report ADD COLUMN safety_related INTEGER NOT NULL DEFAULT 0 CHECK(safety_related IN (0,1));
ALTER TABLE daily_report ADD COLUMN customer_contact TEXT;
ALTER TABLE daily_report ADD COLUMN reviewed_by TEXT REFERENCES user(id);
ALTER TABLE daily_report ADD COLUMN reviewed_at TEXT;

ALTER TABLE technical_report ADD COLUMN plant_site TEXT;
ALTER TABLE technical_report ADD COLUMN area_line TEXT;
ALTER TABLE technical_report ADD COLUMN station_machine TEXT;
ALTER TABLE technical_report ADD COLUMN system_type TEXT;
ALTER TABLE technical_report ADD COLUMN plc_platform TEXT;
ALTER TABLE technical_report ADD COLUMN hmi_scada TEXT;
ALTER TABLE technical_report ADD COLUMN robot_platform TEXT;
ALTER TABLE technical_report ADD COLUMN drive_motion TEXT;
ALTER TABLE technical_report ADD COLUMN network_protocol TEXT;
ALTER TABLE technical_report ADD COLUMN software_version TEXT;
ALTER TABLE technical_report ADD COLUMN program_reference TEXT;
ALTER TABLE technical_report ADD COLUMN production_impact TEXT;
ALTER TABLE technical_report ADD COLUMN validation_result TEXT;
ALTER TABLE technical_report ADD COLUMN open_risk TEXT;
ALTER TABLE technical_report ADD COLUMN reviewed_by TEXT REFERENCES user(id);
ALTER TABLE technical_report ADD COLUMN reviewed_at TEXT;

ALTER TABLE planning_assignment ADD COLUMN status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','published','cancelled'));
ALTER TABLE planning_assignment ADD COLUMN site TEXT;
ALTER TABLE planning_assignment ADD COLUMN required_skill TEXT;
ALTER TABLE planning_assignment ADD COLUMN planned_cost_minor INTEGER CHECK(planned_cost_minor IS NULL OR planned_cost_minor >= 0);
ALTER TABLE planning_assignment ADD COLUMN created_by TEXT REFERENCES user(id);
ALTER TABLE planning_assignment ADD COLUMN created_at TEXT;
ALTER TABLE planning_assignment ADD COLUMN updated_at TEXT;

ALTER TABLE project ADD COLUMN budget_minor INTEGER CHECK(budget_minor IS NULL OR budget_minor >= 0);
ALTER TABLE project ADD COLUMN planned_minutes INTEGER CHECK(planned_minutes IS NULL OR planned_minutes >= 0);

ALTER TABLE document ADD COLUMN original_filename TEXT;
ALTER TABLE document ADD COLUMN description TEXT;
ALTER TABLE document ADD COLUMN sensitive INTEGER NOT NULL DEFAULT 0 CHECK(sensitive IN (0,1));
ALTER TABLE document ADD COLUMN artifact_type TEXT;
ALTER TABLE document ADD COLUMN software_version TEXT;
ALTER TABLE document ADD COLUMN supersedes_id TEXT REFERENCES document(id);
ALTER TABLE document ADD COLUMN approved_at TEXT;
ALTER TABLE document ADD COLUMN approved_by TEXT REFERENCES user(id);

CREATE TABLE IF NOT EXISTS report_time_link (
  report_type TEXT NOT NULL CHECK(report_type IN ('daily','technical')),
  report_id TEXT NOT NULL,
  time_entry_id TEXT NOT NULL REFERENCES time_entry(id),
  PRIMARY KEY(report_type,report_id,time_entry_id)
) STRICT;

CREATE TABLE IF NOT EXISTS worker_availability (
  id TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL REFERENCES user(id),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  availability TEXT NOT NULL CHECK(availability IN ('available','unavailable','tentative')),
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  CHECK(ends_at > starts_at)
) STRICT;

CREATE INDEX IF NOT EXISTS daily_report_worker_date_idx ON daily_report(worker_id,work_date);
CREATE INDEX IF NOT EXISTS daily_report_project_date_idx ON daily_report(project_id,work_date);
CREATE INDEX IF NOT EXISTS technical_report_project_idx ON technical_report(project_id,created_at);
CREATE INDEX IF NOT EXISTS planning_worker_period_idx ON planning_assignment(worker_id,starts_at,ends_at);
CREATE INDEX IF NOT EXISTS document_project_idx ON document(project_id,state,created_at);

INSERT OR IGNORE INTO schema_migration VALUES (3, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
COMMIT;
