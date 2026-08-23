-- B5-M legacy fixture: this script is applied after migrations 0001-0018.
-- It intentionally contains populated legacy rows, including nullable values,
-- so the 0019-0024 upgrade is exercised against business data rather than an
-- empty schema. The migration-contract manifest records its byte digest and
-- the canonical projection digests used by the upgrade test.
BEGIN;

INSERT INTO user(id,name,email,role,status,email_verified,mfa_enrolled,created_at,updated_at,version)
VALUES
  ('legacy-owner','Legacy Owner','legacy.owner@example.test','owner_admin','active',1,1,'2026-08-01T09:00:00.000Z','2026-08-01T09:00:00.000Z',1),
  ('legacy-worker','Legacy Worker','legacy.worker@example.test','worker','active',1,0,'2026-08-01T09:05:00.000Z','2026-08-01T09:05:00.000Z',1);

INSERT INTO legal_entity(id,code,legal_name,currency,billing_address,company_identifiers,created_at,updated_at,version)
VALUES ('legacy-entity','LE-LEGACY','Legacy Engineering Ltd','EUR','Madrid','ES-LEGACY','2026-08-01T09:10:00.000Z','2026-08-01T09:10:00.000Z',1);

INSERT INTO client(id,client_number,legal_name,display_name,status,currency,timezone,created_at,updated_at,version,billing_email,payment_terms_days,notes)
VALUES ('legacy-client','C-0018','Legacy Client','Legacy Client','active','EUR','Europe/Madrid','2026-08-01T09:15:00.000Z','2026-08-01T09:15:00.000Z',1,'billing@legacy.example.test',30,NULL);

INSERT INTO project(id,project_number,client_id,name,timezone,currency,status,billing_model,created_at,updated_at,version,description,site_name,country,project_manager_id,expected_minutes_per_day,client_daily_minimum_minutes,revenue_budget_minor,po_cap_minor,labor_budget_minutes,travel_budget_minor,po_number,daily_report_required,technical_reporting_required,budget_minor,planned_minutes,project_alias,start_date,planned_end_date,actual_end_date,contract_number,budget_type,other_cost_budget_minor,weekly_close_enabled,notes,expected_schedule_id,fixed_price_minor)
VALUES ('legacy-project','C-0018-P-001','legacy-client','Legacy Project','Europe/Madrid','EUR','active','tm','2026-08-01T09:20:00.000Z','2026-08-01T09:20:00.000Z',1,'Upgrade fixture project','Madrid Plant','ES','legacy-owner',480,420,250000,300000,9000,12000,'PO-0018',1,1,250000,9000,'LEGACY','2026-08-01','2026-12-31',NULL,'CONTRACT-0018','fixed',5000,1,NULL,NULL,200000);

INSERT INTO project_member(id,project_id,user_id,assignment_role,starts_on,ends_on,created_at,updated_at,version,planned_minutes,can_submit_technical_report,can_review,status,role_on_project,expected_minutes_per_day,workday_mask,worker_compensation_rule_id,internal_cost_rule_id,client_bill_rule_id)
VALUES ('legacy-membership','legacy-project','legacy-worker','worker','2026-08-01',NULL,'2026-08-01T09:25:00.000Z','2026-08-01T09:25:00.000Z',1,9000,1,0,'active','field engineer',480,'1111100',NULL,NULL,NULL);

INSERT INTO schedule(id,project_id,timezone,effective_from,effective_to,version)
VALUES ('legacy-schedule','legacy-project','Europe/Madrid','2026-08-01',NULL,1);

INSERT INTO time_entry(id,project_id,worker_id,work_date,category,minutes,approval_state,billability_state,invoice_id,created_at,updated_at,version,project_timezone,activity_summary,submitted_at,approved_by,approved_at,finance_approved_by,finance_approved_at,start_time,end_time,activity_code,break_minutes,site,billable_minutes,client_rate_minor,compensation_amount_minor,internal_cost_minor,billing_status,locked_at,locked_by,billing_lock_id)
VALUES ('legacy-time','legacy-project','legacy-worker','2026-08-04','regular',480,'draft','pending',NULL,'2026-08-04T17:00:00.000Z','2026-08-04T17:00:00.000Z',1,'Europe/Madrid','Commissioning work',NULL,NULL,NULL,NULL,NULL,'08:00','16:30','COMM',30,'Madrid Plant',450,12500,8000,5000,'unlocked',NULL,NULL,NULL);

INSERT INTO expense(id,project_id,worker_id,spent_on,category,currency,amount_minor,client_treatment,approval_state,invoice_id,created_at,updated_at,version,vendor,description,who_paid,receipt_document_id,receipt_required,reimbursement_state,submitted_at,approved_by,approved_at,finance_approved_by,finance_approved_at,tax_amount_minor,payment_method,markup_bps,project_currency_amount_minor,billing_treatment,billing_state,billing_amount_minor,billing_lock_id,reimbursement_amount_minor,reimbursed_at,reimbursement_reference,fx_rate_bps)
VALUES ('legacy-expense','legacy-project','legacy-worker','2026-08-04','travel','EUR',4250,'reimbursable','draft',NULL,'2026-08-04T18:00:00.000Z','2026-08-04T18:00:00.000Z',1,'Legacy Rail','Train to site','worker',NULL,1,'pending',NULL,NULL,NULL,NULL,NULL,700,'card',1000,4250,'reimbursable','unlocked',4250,NULL,4250,NULL,NULL,10000);

INSERT INTO daily_report(id,project_id,worker_id,work_date,summary,safety_notes,approval_state,created_at,updated_at,version,site_shift,tasks_completed,problems_found,corrective_actions,client_decisions,downtime_minutes,standby_reason,blockers,open_items,next_day_plan,safety_related,customer_contact,reviewed_by,reviewed_at)
VALUES ('legacy-daily','legacy-project','legacy-worker','2026-08-04','Startup support completed',NULL,'draft','2026-08-04T18:30:00.000Z','2026-08-04T18:30:00.000Z',1,'day','Sensor checks',NULL,NULL,NULL,0,NULL,NULL,'Handover notes','Customer handover',0,NULL,NULL,NULL);

INSERT INTO technical_report(id,project_id,author_id,system_name,controller,change_summary,safety_related,validation,rollback_plan,approval_state,created_at,updated_at,version,plant_site,area_line,station_machine,system_type,plc_platform,hmi_scada,robot_platform,drive_motion,network_protocol,software_version,program_reference,production_impact,validation_result,open_risk,reviewed_by,reviewed_at)
VALUES ('legacy-technical','legacy-project','legacy-worker','Startup PLC','S7-1500','Sensor timing investigation',0,'Validated','Restore prior block','draft','2026-08-04T19:00:00.000Z','2026-08-04T19:00:00.000Z',1,'Madrid Plant','Line A','Station 1','PLC','Siemens','WinCC',NULL,NULL,'Profinet','1.18','PLC-0018','Low','Passed',NULL,NULL,NULL);

INSERT INTO document(id,project_id,owner_id,sha256,media_type,byte_length,state,storage_key,created_at,updated_at,version,original_filename,description,sensitive,artifact_type,software_version,supersedes_id,approved_at,approved_by,sensitivity,safe_filename,scan_status,scanned_at,scan_provider,artifact_metadata_json)
VALUES ('legacy-document','legacy-project','legacy-worker','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','application/pdf',128,'committed','reports/legacy-document.pdf','2026-08-04T19:10:00.000Z','2026-08-04T19:10:00.000Z',1,'legacy.pdf','Legacy report',0,'report',NULL,NULL,NULL,NULL,'internal','legacy.pdf','not_scanned',NULL,NULL,NULL);

INSERT INTO invoice(id,project_id,invoice_number,stream_type,state,currency,subtotal_minor,tax_minor,total_minor,issued_at,snapshot_json,created_at,updated_at,version,billing_rule_id,period_start,period_end,due_at,calculation_hash,sent_at,pdf_status,pdf_storage_key,pdf_sha256,pdf_generated_at,source_lock_at,voided_at,pdf_byte_length)
VALUES ('legacy-invoice','legacy-project',NULL,'labor','draft','EUR',0,0,0,NULL,NULL,'2026-08-04T19:20:00.000Z','2026-08-04T19:20:00.000Z',1,NULL,'2026-08-01','2026-08-31',NULL,NULL,NULL,'pending',NULL,NULL,NULL,NULL,NULL,NULL);

INSERT INTO invoice_line(id,invoice_id,description,quantity_numerator,quantity_denominator,unit_price_minor,subtotal_minor,source_type,source_id,snapshot_json,tax_minor,grouping_key)
VALUES ('legacy-line','legacy-invoice','Legacy labor',1,1,0,0,'manual','legacy-time','{}',0,NULL);

INSERT INTO payment(id,invoice_id,amount_minor,currency,received_at,reference,created_at,idempotency_key)
VALUES ('legacy-payment','legacy-invoice',1,'EUR','2026-08-05T09:00:00.000Z',NULL,'2026-08-05T09:00:00.000Z','legacy-payment-key');

INSERT INTO audit_event(id,actor_id,action,entity_type,entity_id,occurred_at,details_json,project_id,before_json,after_json,reason,correlation_id,metadata_json)
VALUES ('legacy-audit','legacy-owner','project.create','project','legacy-project','2026-08-01T09:20:00.000Z','{"source":"fixture"}','legacy-project',NULL,NULL,NULL,'legacy-correlation',NULL);

INSERT INTO job(id,kind,idempotency_key,state,run_after,lease_until,attempts,payload_json,created_at,updated_at,version)
VALUES ('legacy-job','invoice_render','legacy-job-key','queued','2026-08-05T09:00:00.000Z',NULL,0,'{"invoiceId":"legacy-invoice"}','2026-08-05T09:00:00.000Z','2026-08-05T09:00:00.000Z',1);

INSERT INTO job_run(id,job_id,started_at,finished_at,outcome,error_code)
  VALUES ('legacy-job-run','legacy-job','2026-08-05T09:01:00.000Z','2026-08-05T09:02:00.000Z','succeeded',NULL);

INSERT INTO offline_mutation(mutation_id,user_id,entity_type,entity_id,base_version,payload_json,attachment_ids_json,state,result_json,created_at,processed_at)
  VALUES ('legacy-mutation','legacy-worker','time_entry','legacy-time',1,'{"minutes":480}','[]','accepted','{"ok":true}','2026-08-05T09:05:00.000Z','2026-08-05T09:06:00.000Z');

INSERT INTO mutation_receipt(mutation_id,user_id,entity_type,entity_id,result_json,created_at)
VALUES ('legacy-receipt','legacy-worker','expense','legacy-expense','{"accepted":true}','2026-08-05T09:07:00.000Z');

COMMIT;
