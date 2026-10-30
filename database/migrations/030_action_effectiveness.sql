-- Verification evidence inherits the action's visibility and remains append-only.
CREATE TABLE app.action_effectiveness (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, site_id uuid NOT NULL,
  action_id uuid NOT NULL, action_version integer NOT NULL CHECK(action_version>0),
  verifier_id uuid NOT NULL, result text NOT NULL CHECK(result IN ('effective','ineffective')),
  evidence text NOT NULL CHECK(length(btrim(evidence)) BETWEEN 1 AND 4000), request_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(tenant_id,action_id,action_version), UNIQUE(tenant_id,action_id,verifier_id,request_key),
  FOREIGN KEY(tenant_id,action_id,site_id) REFERENCES app.actions(tenant_id,id,site_id),
  FOREIGN KEY(tenant_id,verifier_id) REFERENCES identity.memberships(tenant_id,user_id)
);
CREATE INDEX action_effectiveness_list_idx ON app.action_effectiveness(tenant_id,action_id,created_at DESC,id DESC);
CREATE INDEX action_effectiveness_site_idx ON app.action_effectiveness(tenant_id,site_id);
CREATE INDEX action_effectiveness_verifier_idx ON app.action_effectiveness(tenant_id,verifier_id);
ALTER TABLE app.action_effectiveness ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.action_effectiveness FORCE ROW LEVEL SECURITY;
CREATE POLICY action_effectiveness_read ON app.action_effectiveness FOR SELECT USING(
  identity.has_site_access(tenant_id,site_id) AND EXISTS(SELECT 1 FROM app.actions a WHERE a.tenant_id=action_effectiveness.tenant_id AND a.id=action_effectiveness.action_id));
CREATE POLICY action_effectiveness_insert ON app.action_effectiveness FOR INSERT WITH CHECK(
  verifier_id=identity.actor_id() AND identity.can_write_site(tenant_id,site_id) AND EXISTS(
    SELECT 1 FROM app.actions a WHERE a.tenant_id=action_effectiveness.tenant_id AND a.id=action_effectiveness.action_id
      AND a.status='closed' AND a.version=action_effectiveness.action_version AND a.owner_id<>identity.actor_id()));
CREATE FUNCTION app.guard_action_effectiveness() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a record;
BEGIN
  SELECT status,version,owner_id INTO a FROM app.actions WHERE tenant_id=NEW.tenant_id AND id=NEW.action_id AND site_id=NEW.site_id FOR UPDATE;
  IF NOT FOUND OR a.status<>'closed' OR a.version<>NEW.action_version OR a.owner_id=identity.actor_id() OR NEW.verifier_id<>identity.actor_id()
    OR NOT identity.can_write_site(NEW.tenant_id,NEW.site_id) THEN RAISE EXCEPTION 'Action verification is not authorized or is stale' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER action_effectiveness_guard BEFORE INSERT ON app.action_effectiveness FOR EACH ROW EXECUTE FUNCTION app.guard_action_effectiveness();
CREATE TRIGGER action_effectiveness_immutable BEFORE UPDATE OR DELETE ON app.action_effectiveness FOR EACH ROW EXECUTE FUNCTION app.protect_audit_history();
REVOKE ALL ON app.action_effectiveness FROM PUBLIC,sentinelle_app;
REVOKE ALL ON FUNCTION app.guard_action_effectiveness() FROM PUBLIC;
GRANT SELECT,INSERT(id,tenant_id,site_id,action_id,action_version,verifier_id,result,evidence,request_key) ON app.action_effectiveness TO sentinelle_app;
