ALTER TABLE app.ethics_records DROP CONSTRAINT ethics_records_kind_check;
ALTER TABLE app.ethics_records ADD CONSTRAINT ethics_records_kind_check CHECK(kind IN ('third_party','assessment','gift','conflict','donation'));
ALTER TABLE app.ethics_records ADD COLUMN questionnaire jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE app.ethics_records ADD COLUMN questionnaire_version integer NOT NULL DEFAULT 1 CHECK(questionnaire_version=1);
ALTER TABLE app.ethics_records ADD COLUMN decision text CHECK(decision IN ('approve','reject','conditional'));
ALTER TABLE app.ethics_records ADD COLUMN decision_note text CHECK(length(decision_note)<=4000);
ALTER TABLE app.ethics_records ADD COLUMN decided_by uuid;
ALTER TABLE app.ethics_records ADD COLUMN decided_at timestamptz;
ALTER TABLE app.ethics_records ADD CONSTRAINT ethics_decider_membership FOREIGN KEY(tenant_id,decided_by) REFERENCES identity.memberships(tenant_id,user_id);
CREATE INDEX ethics_records_decider_idx ON app.ethics_records(tenant_id,decided_by);
CREATE FUNCTION app.valid_ethics_questionnaire(value jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN jsonb_typeof(value)<>'object' THEN false ELSE NOT EXISTS (
  SELECT 1 FROM jsonb_each(value) item(key,val) WHERE key NOT IN ('ownership_known','public_official_link','anticorruption_policy','adverse_history','intermediary_use')
   OR jsonb_typeof(val)<>'string' OR val#>>'{}' NOT IN ('yes','no','unknown')) END
$$;
REVOKE ALL ON FUNCTION app.valid_ethics_questionnaire(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.valid_ethics_questionnaire(jsonb) TO sentinelle_app;
ALTER TABLE app.ethics_records ADD CONSTRAINT ethics_questionnaire_valid CHECK(app.valid_ethics_questionnaire(questionnaire) AND (kind='assessment' OR questionnaire='{}'::jsonb));
ALTER TABLE app.ethics_records ADD CONSTRAINT ethics_decision_consistent CHECK((decision IS NULL AND decision_note IS NULL AND decided_by IS NULL AND decided_at IS NULL) OR (decision IS NOT NULL AND length(btrim(decision_note))>0 AND decided_by IS NOT NULL AND decided_at IS NOT NULL));
GRANT UPDATE(questionnaire,decision,decision_note,decided_by,decided_at) ON app.ethics_records TO sentinelle_app;
