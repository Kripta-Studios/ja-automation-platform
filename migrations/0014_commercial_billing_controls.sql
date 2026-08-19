BEGIN IMMEDIATE;

-- Commercial controls are additive. Existing projects remain unchanged when
-- these values are NULL; billing rules continue to default to the legacy
-- cadence and stream behavior.
ALTER TABLE project ADD COLUMN fixed_price_minor INTEGER CHECK(fixed_price_minor IS NULL OR fixed_price_minor >= 0);
ALTER TABLE billing_rule ADD COLUMN fixed_amount_minor INTEGER CHECK(fixed_amount_minor IS NULL OR fixed_amount_minor >= 0);
ALTER TABLE billing_rule ADD COLUMN included_minutes INTEGER CHECK(included_minutes IS NULL OR included_minutes >= 0);
ALTER TABLE billing_rule ADD COLUMN monthly_cutoff_day INTEGER CHECK(monthly_cutoff_day IS NULL OR monthly_cutoff_day BETWEEN 1 AND 28);

CREATE INDEX IF NOT EXISTS billing_rule_cutoff_idx ON billing_rule(project_id,cadence_type,monthly_cutoff_day);

INSERT OR IGNORE INTO schema_migration VALUES (14, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
COMMIT;
