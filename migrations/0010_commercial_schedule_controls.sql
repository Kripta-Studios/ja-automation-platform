BEGIN IMMEDIATE;

-- Link the reviewed schedule and billing-contact records without changing the
-- meaning of existing projects or billing streams.
ALTER TABLE project ADD COLUMN expected_schedule_id TEXT REFERENCES schedule(id);
ALTER TABLE billing_rule ADD COLUMN billing_contact_id TEXT REFERENCES client_contact(id);

CREATE INDEX IF NOT EXISTS project_schedule_idx ON project(expected_schedule_id);
CREATE INDEX IF NOT EXISTS billing_contact_idx ON billing_rule(billing_contact_id);
CREATE INDEX IF NOT EXISTS worker_availability_lookup_idx ON worker_availability(worker_id,starts_at,ends_at,availability);
CREATE INDEX IF NOT EXISTS outbox_delivery_idx ON outbox_event(delivered_at,available_at,attempts);

INSERT OR IGNORE INTO schema_migration VALUES (10, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
COMMIT;
