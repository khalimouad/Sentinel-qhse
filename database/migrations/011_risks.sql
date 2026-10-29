CREATE TABLE app.risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, site_id uuid NOT NULL,
  title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 300),
  description text NOT NULL CHECK(length(btrim(description)) BETWEEN 1 AND 6000),
  category text NOT NULL CHECK(category IN ('quality','safety','environment','compliance','governance','other')),
  owner_id uuid NOT NULL, created_by uuid NOT NULL,
  inherent_likelihood integer NOT NULL CHECK(inherent_likelihood BETWEEN 1 AND 5),
  inherent_severity integer NOT NULL CHECK(inherent_severity BETWEEN 1 AND 5),
  residual_likelihood integer NOT NULL CHECK(residual_likelihood BETWEEN 1 AND 5),
  residual_severity integer NOT NULL CHECK(residual_severity BETWEEN 1 AND 5),
  inherent_score integer GENERATED ALWAYS AS (inherent_likelihood*inherent_severity) STORED,
  residual_score integer GENERATED ALWAYS AS (residual_likelihood*residual_severity) STORED,
  controls text NOT NULL CHECK(length(btrim(controls)) BETWEEN 1 AND 4000),
  next_review_on date NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','accepted','archived')),
  acceptance_note text CHECK(length(acceptance_note)<=4000), accepted_by uuid, accepted_at timestamptz,
  last_change_note text NOT NULL CHECK(length(btrim(last_change_note)) BETWEEN 1 AND 4000),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id,site_id),
  FOREIGN KEY(tenant_id,site_id) REFERENCES app.sites(tenant_id,id),
  FOREIGN KEY(tenant_id,owner_id) REFERENCES identity.memberships(tenant_id,user_id),
  FOREIGN KEY(tenant_id,created_by) REFERENCES identity.memberships(tenant_id,user_id),
  FOREIGN KEY(tenant_id,accepted_by) REFERENCES identity.memberships(tenant_id,user_id)
);
CREATE INDEX risks_list_idx ON app.risks(tenant_id,site_id,updated_at DESC,id);
CREATE INDEX risks_review_idx ON app.risks(tenant_id,next_review_on) WHERE status<>'archived';
CREATE INDEX risks_owner_idx ON app.risks(tenant_id,owner_id);
CREATE INDEX risks_creator_idx ON app.risks(tenant_id,created_by);
CREATE INDEX risks_acceptor_idx ON app.risks(tenant_id,accepted_by);
CREATE TABLE app.risk_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, site_id uuid NOT NULL, risk_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES identity.users(id), operation text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(), before_data jsonb, after_data jsonb NOT NULL,
  FOREIGN KEY(tenant_id,risk_id,site_id) REFERENCES app.risks(tenant_id,id,site_id)
);
CREATE INDEX risk_events_parent_idx ON app.risk_events(tenant_id,risk_id,occurred_at DESC);
CREATE INDEX risk_events_site_idx ON app.risk_events(tenant_id,site_id);
CREATE INDEX risk_events_actor_idx ON app.risk_events(actor_id);
ALTER TABLE app.risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.risks FORCE ROW LEVEL SECURITY;
ALTER TABLE app.risk_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.risk_events FORCE ROW LEVEL SECURITY;
CREATE POLICY risks_read ON app.risks FOR SELECT USING(identity.can_write_site(tenant_id,site_id));
CREATE POLICY risks_create ON app.risks FOR INSERT WITH CHECK(identity.can_write_site(tenant_id,site_id) AND created_by=identity.actor_id());
CREATE POLICY risks_update ON app.risks FOR UPDATE USING(identity.can_write_site(tenant_id,site_id)) WITH CHECK(identity.can_write_site(tenant_id,site_id));
CREATE POLICY risk_events_read ON app.risk_events FOR SELECT USING(identity.can_write_site(tenant_id,site_id));
CREATE POLICY risk_events_append ON app.risk_events FOR INSERT WITH CHECK(identity.can_write_site(tenant_id,site_id));
ALTER TABLE app.actions ADD COLUMN risk_id uuid;
ALTER TABLE app.actions ADD CONSTRAINT action_risk_scope FOREIGN KEY(tenant_id,risk_id,site_id) REFERENCES app.risks(tenant_id,id,site_id);
ALTER TABLE app.actions ADD CONSTRAINT action_single_origin CHECK(report_id IS NULL OR risk_id IS NULL);
CREATE INDEX actions_risk_idx ON app.actions(tenant_id,risk_id,site_id);
DROP POLICY actions_read ON app.actions;
CREATE POLICY actions_read ON app.actions FOR SELECT USING(identity.has_site_access(tenant_id,site_id)
  AND (report_id IS NULL OR EXISTS(SELECT 1 FROM app.reports r WHERE r.tenant_id=actions.tenant_id AND r.id=actions.report_id))
  AND (risk_id IS NULL OR EXISTS(SELECT 1 FROM app.risks r WHERE r.tenant_id=actions.tenant_id AND r.id=actions.risk_id)));
-- Audit, comments and notifications already inherit action visibility through EXISTS.
CREATE FUNCTION app.guard_risk_change() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE open_count integer;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NOT identity.can_review_site(NEW.tenant_id,NEW.site_id,NEW.owner_id) THEN RAISE EXCEPTION 'Risk owner must be an eligible site manager' USING ERRCODE='23514'; END IF;
    IF NEW.status<>'active' OR NEW.accepted_by IS NOT NULL OR NEW.accepted_at IS NOT NULL OR NEW.acceptance_note IS NOT NULL THEN RAISE EXCEPTION 'Risk must start active' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id AND NOT identity.can_review_site(NEW.tenant_id,NEW.site_id,NEW.owner_id) THEN RAISE EXCEPTION 'Risk owner must be an eligible site manager' USING ERRCODE='23514'; END IF;
  IF OLD.status IN ('accepted','archived') AND NEW.status=OLD.status THEN RAISE EXCEPTION 'Reopen risk before changing its assessment' USING ERRCODE='23514'; END IF;
  IF NEW.status<>OLD.status THEN
    IF NOT ((OLD.status='active' AND NEW.status IN ('accepted','archived')) OR (OLD.status='accepted' AND NEW.status IN ('active','archived')) OR (OLD.status='archived' AND NEW.status='active')) THEN
      RAISE EXCEPTION 'Invalid risk transition' USING ERRCODE='23514'; END IF;
    IF ROW(NEW.title,NEW.description,NEW.category,NEW.owner_id,NEW.inherent_likelihood,NEW.inherent_severity,NEW.residual_likelihood,NEW.residual_severity,NEW.controls,NEW.next_review_on)
      IS DISTINCT FROM ROW(OLD.title,OLD.description,OLD.category,OLD.owner_id,OLD.inherent_likelihood,OLD.inherent_severity,OLD.residual_likelihood,OLD.residual_severity,OLD.controls,OLD.next_review_on) THEN
      RAISE EXCEPTION 'Change assessment separately from decisions' USING ERRCODE='23514'; END IF;
    IF NEW.status IN ('accepted','archived') THEN
      SELECT count(*) INTO open_count FROM app.actions WHERE tenant_id=NEW.tenant_id AND risk_id=NEW.id AND status<>'closed';
      IF open_count>0 THEN RAISE EXCEPTION 'Complete linked actions before accepting or archiving' USING ERRCODE='23514'; END IF;
    END IF;
    IF NEW.status='accepted' THEN
      IF NOT identity.can_review_site(NEW.tenant_id,NEW.site_id,NEW.owner_id) OR identity.actor_id()=NEW.owner_id OR NOT identity.can_review_site(NEW.tenant_id,NEW.site_id,identity.actor_id()) OR length(btrim(coalesce(NEW.acceptance_note,'')))=0 THEN
        RAISE EXCEPTION 'Independent named acceptance and evidence are required' USING ERRCODE='42501'; END IF;
      IF NEW.next_review_on<(statement_timestamp() AT TIME ZONE 'UTC')::date THEN RAISE EXCEPTION 'Set a current review date before accepting' USING ERRCODE='23514'; END IF;
      NEW.accepted_by:=identity.actor_id(); NEW.accepted_at:=clock_timestamp();
    ELSE
      NEW.acceptance_note:=NULL; NEW.accepted_by:=NULL; NEW.accepted_at:=NULL;
    END IF;
  ELSE
    IF NEW.acceptance_note IS DISTINCT FROM OLD.acceptance_note THEN RAISE EXCEPTION 'Acceptance evidence requires an acceptance decision' USING ERRCODE='23514'; END IF;
  END IF;
  NEW.revision:=OLD.revision+1; NEW.updated_at:=clock_timestamp(); RETURN NEW;
END $$;
CREATE TRIGGER risk_change_guard BEFORE INSERT OR UPDATE ON app.risks FOR EACH ROW EXECUTE FUNCTION app.guard_risk_change();
CREATE FUNCTION app.record_risk_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO app.risk_events(tenant_id,site_id,risk_id,actor_id,operation,before_data,after_data)
    VALUES(NEW.tenant_id,NEW.site_id,NEW.id,identity.actor_id(),TG_OP,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW));
  RETURN NEW;
END $$;
CREATE TRIGGER risk_history AFTER INSERT OR UPDATE ON app.risks FOR EACH ROW EXECUTE FUNCTION app.record_risk_change();
CREATE TRIGGER immutable_risk_history BEFORE UPDATE OR DELETE ON app.risk_events FOR EACH ROW EXECUTE FUNCTION app.protect_audit_history();
CREATE FUNCTION app.guard_risk_action() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE parent app.risks;
BEGIN
  IF NEW.risk_id IS NOT NULL THEN
    SELECT * INTO parent FROM app.risks WHERE tenant_id=NEW.tenant_id AND id=NEW.risk_id FOR UPDATE;
    IF parent.id IS NULL OR parent.status<>'active' OR NOT identity.can_review_site(NEW.tenant_id,NEW.site_id,NEW.owner_id) THEN
      RAISE EXCEPTION 'Risk actions require an active risk and eligible assignee' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER risk_action_guard BEFORE INSERT ON app.actions FOR EACH ROW EXECUTE FUNCTION app.guard_risk_action();
CREATE FUNCTION app.sync_risk_action() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.risk_id IS NOT NULL AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE app.risks SET status=CASE WHEN NEW.status='open' THEN 'active' ELSE status END,
      last_change_note=CASE WHEN TG_OP='INSERT' THEN 'Action de traitement ajoutée : ' ELSE 'Statut de l’action de traitement modifié : ' END||NEW.id::text
      WHERE tenant_id=NEW.tenant_id AND id=NEW.risk_id AND (status='active' OR NEW.status='open');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER risk_action_sync AFTER INSERT OR UPDATE ON app.actions FOR EACH ROW EXECUTE FUNCTION app.sync_risk_action();
REVOKE ALL ON app.risks,app.risk_events FROM PUBLIC,sentinelle_app;
REVOKE ALL ON FUNCTION app.guard_risk_change(),app.record_risk_change(),app.guard_risk_action(),app.sync_risk_action() FROM PUBLIC;
GRANT SELECT ON app.risks,app.risk_events TO sentinelle_app;
GRANT INSERT(id,tenant_id,site_id,title,description,category,owner_id,created_by,inherent_likelihood,inherent_severity,residual_likelihood,residual_severity,controls,next_review_on,last_change_note) ON app.risks TO sentinelle_app;
GRANT UPDATE(title,description,category,owner_id,inherent_likelihood,inherent_severity,residual_likelihood,residual_severity,controls,next_review_on,status,acceptance_note,last_change_note) ON app.risks TO sentinelle_app;
GRANT INSERT(risk_id) ON app.actions TO sentinelle_app;
