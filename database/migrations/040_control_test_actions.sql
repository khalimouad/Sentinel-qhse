ALTER TABLE app.actions ADD COLUMN control_test_id uuid;
ALTER TABLE app.actions ADD COLUMN control_test_request_key uuid;
ALTER TABLE app.actions ADD COLUMN control_test_actor_id uuid;
ALTER TABLE app.actions ADD CONSTRAINT action_control_test_scope FOREIGN KEY(tenant_id,control_test_id,site_id) REFERENCES app.control_tests(tenant_id,id,site_id);
ALTER TABLE app.actions ADD CONSTRAINT action_control_actor_scope FOREIGN KEY(tenant_id,control_test_actor_id) REFERENCES identity.memberships(tenant_id,user_id);
ALTER TABLE app.actions DROP CONSTRAINT action_single_origin;
ALTER TABLE app.actions ADD CONSTRAINT action_single_origin CHECK(num_nonnulls(report_id,risk_id,obligation_id,control_test_id)<=1);
ALTER TABLE app.actions ADD CONSTRAINT action_control_request_fields CHECK((control_test_id IS NULL AND control_test_request_key IS NULL AND control_test_actor_id IS NULL) OR (control_test_id IS NOT NULL AND control_test_request_key IS NOT NULL AND control_test_actor_id IS NOT NULL));
CREATE UNIQUE INDEX action_control_request_idx ON app.actions(tenant_id,control_test_id,control_test_actor_id,control_test_request_key) WHERE control_test_id IS NOT NULL;
CREATE INDEX actions_control_test_idx ON app.actions(tenant_id,control_test_id,site_id);
CREATE INDEX actions_control_actor_idx ON app.actions(tenant_id,control_test_actor_id);
DROP POLICY actions_read ON app.actions;
CREATE POLICY actions_read ON app.actions FOR SELECT USING(identity.has_site_access(tenant_id,site_id)
 AND (report_id IS NULL OR EXISTS(SELECT 1 FROM app.reports r WHERE r.tenant_id=actions.tenant_id AND r.id=actions.report_id))
 AND (risk_id IS NULL OR EXISTS(SELECT 1 FROM app.risks r WHERE r.tenant_id=actions.tenant_id AND r.id=actions.risk_id))
 AND (obligation_id IS NULL OR EXISTS(SELECT 1 FROM app.obligations o WHERE o.tenant_id=actions.tenant_id AND o.id=actions.obligation_id))
 AND (control_test_id IS NULL OR EXISTS(SELECT 1 FROM app.control_tests t WHERE t.tenant_id=actions.tenant_id AND t.id=actions.control_test_id)));
CREATE FUNCTION app.guard_control_test_action() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.control_test_id IS NOT NULL THEN
  IF NEW.control_test_actor_id<>identity.actor_id() OR NOT identity.can_review_site(NEW.tenant_id,NEW.site_id,NEW.owner_id) OR NOT EXISTS(
   SELECT 1 FROM app.control_tests t WHERE t.tenant_id=NEW.tenant_id AND t.id=NEW.control_test_id AND t.site_id=NEW.site_id AND t.status='completed' AND t.result IN ('partial','ineffective')) THEN
   RAISE EXCEPTION 'Action requires a non-effective completed test and eligible owner' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER control_test_action_guard BEFORE INSERT ON app.actions FOR EACH ROW EXECUTE FUNCTION app.guard_control_test_action();
REVOKE ALL ON FUNCTION app.guard_control_test_action() FROM PUBLIC;
GRANT INSERT(control_test_id,control_test_request_key,control_test_actor_id) ON app.actions TO sentinelle_app;
