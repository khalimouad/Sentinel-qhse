CREATE TABLE app.process_indicators (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,site_id uuid NOT NULL,process_id uuid NOT NULL,
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 300),unit text NOT NULL CHECK(length(btrim(unit)) BETWEEN 1 AND 50),
 target numeric(18,4) NOT NULL,direction text NOT NULL CHECK(direction IN ('at_least','at_most')),
 frequency text NOT NULL CHECK(frequency IN ('monthly','quarterly','annual','other')),owner_id uuid NOT NULL,created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(tenant_id,id,site_id),
 FOREIGN KEY(tenant_id,process_id,site_id) REFERENCES app.processes(tenant_id,id,site_id),
 FOREIGN KEY(tenant_id,owner_id) REFERENCES identity.memberships(tenant_id,user_id),FOREIGN KEY(tenant_id,created_by) REFERENCES identity.memberships(tenant_id,user_id)
);
CREATE INDEX process_indicators_parent_idx ON app.process_indicators(tenant_id,process_id,created_at DESC,id DESC);
CREATE INDEX process_indicators_site_idx ON app.process_indicators(tenant_id,site_id);
CREATE INDEX process_indicators_owner_idx ON app.process_indicators(tenant_id,owner_id);
CREATE INDEX process_indicators_creator_idx ON app.process_indicators(tenant_id,created_by);
CREATE TABLE app.indicator_measurements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,site_id uuid NOT NULL,indicator_id uuid NOT NULL,
 measured_on date NOT NULL,value numeric(18,4) NOT NULL,note text NOT NULL DEFAULT '' CHECK(length(note)<=2000),created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(tenant_id,indicator_id,measured_on),
 FOREIGN KEY(tenant_id,indicator_id,site_id) REFERENCES app.process_indicators(tenant_id,id,site_id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES identity.memberships(tenant_id,user_id)
);
CREATE INDEX indicator_measurements_list_idx ON app.indicator_measurements(tenant_id,indicator_id,measured_on DESC,id DESC);
CREATE INDEX indicator_measurements_site_idx ON app.indicator_measurements(tenant_id,site_id);
CREATE INDEX indicator_measurements_creator_idx ON app.indicator_measurements(tenant_id,created_by);
ALTER TABLE app.process_indicators ENABLE ROW LEVEL SECURITY;ALTER TABLE app.process_indicators FORCE ROW LEVEL SECURITY;
ALTER TABLE app.indicator_measurements ENABLE ROW LEVEL SECURITY;ALTER TABLE app.indicator_measurements FORCE ROW LEVEL SECURITY;
CREATE POLICY process_indicator_read ON app.process_indicators FOR SELECT USING(identity.can_write_site(tenant_id,site_id) AND EXISTS(SELECT 1 FROM app.processes p WHERE p.tenant_id=process_indicators.tenant_id AND p.id=process_indicators.process_id));
CREATE POLICY process_indicator_insert ON app.process_indicators FOR INSERT WITH CHECK(identity.can_write_site(tenant_id,site_id) AND created_by=identity.actor_id() AND identity.can_review_site(tenant_id,site_id,owner_id) AND EXISTS(SELECT 1 FROM app.processes p WHERE p.tenant_id=process_indicators.tenant_id AND p.id=process_indicators.process_id AND p.status='active'));
CREATE POLICY indicator_measurement_read ON app.indicator_measurements FOR SELECT USING(identity.can_write_site(tenant_id,site_id) AND EXISTS(SELECT 1 FROM app.process_indicators i WHERE i.tenant_id=indicator_measurements.tenant_id AND i.id=indicator_measurements.indicator_id));
CREATE POLICY indicator_measurement_insert ON app.indicator_measurements FOR INSERT WITH CHECK(identity.can_write_site(tenant_id,site_id) AND created_by=identity.actor_id() AND EXISTS(SELECT 1 FROM app.process_indicators i JOIN app.processes p ON p.tenant_id=i.tenant_id AND p.id=i.process_id WHERE i.tenant_id=indicator_measurements.tenant_id AND i.id=indicator_measurements.indicator_id AND p.status='active'));
CREATE TRIGGER process_indicator_immutable BEFORE UPDATE OR DELETE ON app.process_indicators FOR EACH ROW EXECUTE FUNCTION app.protect_audit_history();
CREATE TRIGGER indicator_measurement_immutable BEFORE UPDATE OR DELETE ON app.indicator_measurements FOR EACH ROW EXECUTE FUNCTION app.protect_audit_history();
REVOKE ALL ON app.process_indicators,app.indicator_measurements FROM PUBLIC,sentinelle_app;
GRANT SELECT,INSERT(id,tenant_id,site_id,process_id,title,unit,target,direction,frequency,owner_id,created_by) ON app.process_indicators TO sentinelle_app;
GRANT SELECT,INSERT(id,tenant_id,site_id,indicator_id,measured_on,value,note,created_by) ON app.indicator_measurements TO sentinelle_app;
