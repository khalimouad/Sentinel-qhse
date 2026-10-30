CREATE TABLE app.control_tests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,site_id uuid NOT NULL,control_id uuid NOT NULL,
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 300),planned_on date NOT NULL,tester_id uuid NOT NULL,created_by uuid NOT NULL,
 status text NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','completed')),result text CHECK(result IN ('effective','ineffective','partial')),
 evidence_reference text CHECK(length(evidence_reference)<=2000),conclusion text CHECK(length(conclusion)<=4000),tested_on date,
 completed_by uuid,completed_at timestamptz,revision integer NOT NULL DEFAULT 1 CHECK(revision>0),request_key uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id,site_id),UNIQUE(tenant_id,control_id,created_by,request_key),
 FOREIGN KEY(tenant_id,control_id,site_id) REFERENCES app.ethics_records(tenant_id,id,site_id),
 FOREIGN KEY(tenant_id,tester_id) REFERENCES identity.memberships(tenant_id,user_id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES identity.memberships(tenant_id,user_id),
 FOREIGN KEY(tenant_id,completed_by) REFERENCES identity.memberships(tenant_id,user_id),
 CHECK((status='planned' AND result IS NULL AND tested_on IS NULL AND completed_by IS NULL AND completed_at IS NULL AND evidence_reference IS NULL AND conclusion IS NULL)
 OR (status='completed' AND result IS NOT NULL AND tested_on IS NOT NULL AND completed_by IS NOT NULL AND completed_at IS NOT NULL AND evidence_reference IS NOT NULL AND length(btrim(evidence_reference))>0 AND conclusion IS NOT NULL AND length(btrim(conclusion))>0))
);
CREATE INDEX control_tests_list_idx ON app.control_tests(tenant_id,control_id,planned_on DESC,id DESC);
CREATE INDEX control_tests_site_idx ON app.control_tests(tenant_id,site_id);
CREATE INDEX control_tests_tester_idx ON app.control_tests(tenant_id,tester_id);
CREATE INDEX control_tests_creator_idx ON app.control_tests(tenant_id,created_by);
CREATE INDEX control_tests_completer_idx ON app.control_tests(tenant_id,completed_by);
ALTER TABLE app.control_tests ENABLE ROW LEVEL SECURITY; ALTER TABLE app.control_tests FORCE ROW LEVEL SECURITY;
CREATE POLICY control_tests_read ON app.control_tests FOR SELECT USING(identity.can_write_site(tenant_id,site_id) AND EXISTS(SELECT 1 FROM app.ethics_records e WHERE e.tenant_id=control_tests.tenant_id AND e.id=control_tests.control_id AND e.kind='control'));
CREATE POLICY control_tests_insert ON app.control_tests FOR INSERT WITH CHECK(identity.can_write_site(tenant_id,site_id) AND created_by=identity.actor_id() AND EXISTS(SELECT 1 FROM app.ethics_records e WHERE e.tenant_id=control_tests.tenant_id AND e.id=control_tests.control_id AND e.kind='control'));
CREATE POLICY control_tests_update ON app.control_tests FOR UPDATE USING(identity.can_write_site(tenant_id,site_id)) WITH CHECK(identity.can_write_site(tenant_id,site_id));
CREATE FUNCTION app.guard_control_test() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'planned' OR NOT identity.can_review_site(NEW.tenant_id,NEW.site_id,NEW.tester_id) THEN RAISE EXCEPTION 'Invalid control test' USING ERRCODE='23514'; END IF;
 ELSE
  IF OLD.status<>'planned' OR NEW.status<>'completed' OR OLD.tester_id<>identity.actor_id() THEN RAISE EXCEPTION 'Only the designated tester can complete a planned test' USING ERRCODE='42501'; END IF;
  NEW.completed_by:=identity.actor_id();NEW.completed_at:=clock_timestamp();NEW.revision:=OLD.revision+1;NEW.updated_at:=clock_timestamp();
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER control_test_guard BEFORE INSERT OR UPDATE ON app.control_tests FOR EACH ROW EXECUTE FUNCTION app.guard_control_test();
REVOKE ALL ON app.control_tests FROM PUBLIC,sentinelle_app;
REVOKE ALL ON FUNCTION app.guard_control_test() FROM PUBLIC;
GRANT SELECT,INSERT(id,tenant_id,site_id,control_id,title,planned_on,tester_id,created_by,request_key) ON app.control_tests TO sentinelle_app;
GRANT UPDATE(status,result,evidence_reference,conclusion,tested_on) ON app.control_tests TO sentinelle_app;
