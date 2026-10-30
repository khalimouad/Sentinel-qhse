CREATE TABLE app.ethics_thresholds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,site_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('gift','donation')),currency text NOT NULL CHECK(currency IN ('EUR','XOF','XAF','MAD','USD','GBP')),
 amount numeric(14,2) NOT NULL CHECK(amount>=0),version integer NOT NULL CHECK(version>0),created_by uuid NOT NULL,request_key uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,site_id,kind,currency,version),UNIQUE(tenant_id,site_id,created_by,request_key),UNIQUE(tenant_id,id,site_id),
 FOREIGN KEY(tenant_id,site_id) REFERENCES app.sites(tenant_id,id),FOREIGN KEY(tenant_id,created_by) REFERENCES identity.memberships(tenant_id,user_id)
);
CREATE INDEX ethics_thresholds_current_idx ON app.ethics_thresholds(tenant_id,site_id,kind,currency,version DESC);
CREATE INDEX ethics_thresholds_actor_idx ON app.ethics_thresholds(tenant_id,created_by);
ALTER TABLE app.ethics_thresholds ENABLE ROW LEVEL SECURITY;ALTER TABLE app.ethics_thresholds FORCE ROW LEVEL SECURITY;
CREATE POLICY ethics_thresholds_read ON app.ethics_thresholds FOR SELECT USING(identity.can_write_site(tenant_id,site_id));
CREATE POLICY ethics_thresholds_insert ON app.ethics_thresholds FOR INSERT WITH CHECK(identity.can_write_site(tenant_id,site_id) AND identity.current_role(tenant_id)='admin' AND created_by=identity.actor_id());
CREATE TRIGGER ethics_threshold_immutable BEFORE UPDATE OR DELETE ON app.ethics_thresholds FOR EACH ROW EXECUTE FUNCTION app.protect_audit_history();
REVOKE ALL ON app.ethics_thresholds FROM PUBLIC,sentinelle_app;
GRANT SELECT,INSERT(id,tenant_id,site_id,kind,currency,amount,version,created_by,request_key) ON app.ethics_thresholds TO sentinelle_app;
ALTER TABLE app.ethics_records ADD COLUMN decision_threshold_id uuid;
ALTER TABLE app.ethics_records ADD COLUMN decision_threshold_amount numeric(14,2);
ALTER TABLE app.ethics_records ADD COLUMN decision_escalated boolean NOT NULL DEFAULT false;
ALTER TABLE app.ethics_records ADD CONSTRAINT ethics_decision_threshold_scope FOREIGN KEY(tenant_id,decision_threshold_id,site_id) REFERENCES app.ethics_thresholds(tenant_id,id,site_id);
ALTER TABLE app.ethics_records ADD CONSTRAINT ethics_threshold_snapshot CHECK((decision_threshold_id IS NULL AND decision_threshold_amount IS NULL AND decision_escalated=false) OR (decision_threshold_id IS NOT NULL AND decision_threshold_amount IS NOT NULL AND decision IS NOT NULL));
CREATE INDEX ethics_records_decision_threshold_idx ON app.ethics_records(tenant_id,decision_threshold_id,site_id);
GRANT UPDATE(decision_threshold_id,decision_threshold_amount,decision_escalated) ON app.ethics_records TO sentinelle_app;
