CREATE TABLE app.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES app.tenants(id), site_id uuid NOT NULL,
  title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 300), description text NOT NULL CHECK(length(btrim(description)) BETWEEN 1 AND 10000),
  kind text NOT NULL CHECK(kind IN ('incident','near_miss','nonconformity','complaint')),
  severity text NOT NULL CHECK(severity IN ('low','medium','high','critical')), occurred_at timestamptz NOT NULL,
  reported_by uuid NOT NULL, status text NOT NULL DEFAULT 'reported' CHECK(status IN ('reported','in_analysis','action_plan','effectiveness_review','closed')),
  owner_id uuid, verifier_id uuid, correction text NOT NULL DEFAULT '' CHECK(length(correction)<=4000),
  root_cause text NOT NULL DEFAULT '' CHECK(length(root_cause)<=4000),
  five_whys jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(five_whys)='array' AND jsonb_array_length(five_whys)<=5),
  cost_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(cost_amount>=0),
  currency text NOT NULL DEFAULT 'XOF' CHECK(currency IN ('XOF','XAF','MAD','EUR','USD','GBP')),
  effectiveness text NOT NULL DEFAULT 'not_evaluated' CHECK(effectiveness IN ('not_evaluated','effective','ineffective')),
  effectiveness_note text CHECK(length(effectiveness_note)<=4000), reviewed_by uuid, reviewed_at timestamptz, closed_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0), last_change_note text CHECK(length(last_change_note)<=4000),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(owner_id IS NULL OR verifier_id IS NULL OR owner_id<>verifier_id),
  CHECK(currency NOT IN ('XOF','XAF') OR cost_amount=trunc(cost_amount)),
  UNIQUE(tenant_id,id,site_id),
  FOREIGN KEY(tenant_id,site_id) REFERENCES app.sites(tenant_id,id),
  FOREIGN KEY(tenant_id,reported_by) REFERENCES identity.memberships(tenant_id,user_id),
  FOREIGN KEY(tenant_id,owner_id) REFERENCES identity.memberships(tenant_id,user_id),
  FOREIGN KEY(tenant_id,verifier_id) REFERENCES identity.memberships(tenant_id,user_id),
  FOREIGN KEY(tenant_id,reviewed_by) REFERENCES identity.memberships(tenant_id,user_id)
);
CREATE INDEX reports_list_idx ON app.reports(tenant_id,created_at DESC,id);
CREATE INDEX reports_site_idx ON app.reports(tenant_id,site_id,status);
CREATE INDEX reports_reporter_idx ON app.reports(tenant_id,reported_by);
CREATE INDEX reports_owner_idx ON app.reports(tenant_id,owner_id);
CREATE INDEX reports_verifier_idx ON app.reports(tenant_id,verifier_id);
CREATE INDEX reports_reviewed_by_idx ON app.reports(tenant_id,reviewed_by);
ALTER TABLE app.actions ADD COLUMN report_id uuid;
ALTER TABLE app.actions ADD CONSTRAINT action_report_scope FOREIGN KEY(tenant_id,report_id,site_id) REFERENCES app.reports(tenant_id,id,site_id);
CREATE INDEX actions_report_idx ON app.actions(tenant_id,report_id);
CREATE TABLE app.report_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, site_id uuid NOT NULL, report_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES identity.users(id), operation text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(), before_data jsonb, after_data jsonb NOT NULL,
  FOREIGN KEY(tenant_id,report_id,site_id) REFERENCES app.reports(tenant_id,id,site_id)
);
CREATE INDEX report_events_report_idx ON app.report_events(tenant_id,report_id,occurred_at DESC);
CREATE INDEX report_events_site_idx ON app.report_events(tenant_id,site_id);
CREATE INDEX report_events_actor_idx ON app.report_events(actor_id);
ALTER TABLE app.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.reports FORCE ROW LEVEL SECURITY;
ALTER TABLE app.report_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.report_events FORCE ROW LEVEL SECURITY;
CREATE POLICY reports_read ON app.reports FOR SELECT USING(identity.has_site_access(tenant_id,site_id) AND (reported_by=identity.actor_id() OR identity.can_write_site(tenant_id,site_id)));
CREATE POLICY reports_create ON app.reports FOR INSERT WITH CHECK(identity.has_site_access(tenant_id,site_id) AND reported_by=identity.actor_id());
CREATE POLICY reports_update ON app.reports FOR UPDATE USING(identity.can_write_site(tenant_id,site_id)) WITH CHECK(identity.can_write_site(tenant_id,site_id));
CREATE POLICY report_events_read ON app.report_events FOR SELECT USING(identity.has_site_access(tenant_id,site_id) AND EXISTS(SELECT 1 FROM app.reports r WHERE r.id=report_id));
CREATE POLICY report_events_append ON app.report_events FOR INSERT WITH CHECK(identity.has_site_access(tenant_id,site_id));
DROP POLICY actions_read ON app.actions;
CREATE POLICY actions_read ON app.actions FOR SELECT USING(identity.has_site_access(tenant_id,site_id) AND (report_id IS NULL OR EXISTS(SELECT 1 FROM app.reports r WHERE r.id=report_id)));
DROP POLICY audit_read ON app.audit_events;
CREATE POLICY audit_read ON app.audit_events FOR SELECT USING(identity.has_site_access(tenant_id,site_id) AND EXISTS(SELECT 1 FROM app.actions a WHERE a.id=action_id));

CREATE FUNCTION app.guard_report_change() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE linked_count integer; open_count integer;
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id AND NEW.owner_id IS NOT NULL AND NOT identity.can_review_site(NEW.tenant_id,NEW.site_id,NEW.owner_id) THEN RAISE EXCEPTION 'Invalid report owner' USING ERRCODE='23514'; END IF;
  IF NEW.verifier_id IS DISTINCT FROM OLD.verifier_id AND NEW.verifier_id IS NOT NULL AND NOT identity.can_review_site(NEW.tenant_id,NEW.site_id,NEW.verifier_id) THEN RAISE EXCEPTION 'Invalid effectiveness verifier' USING ERRCODE='23514'; END IF;
  IF OLD.status IN ('closed','effectiveness_review') AND NEW.status=OLD.status THEN RAISE EXCEPTION 'Return or reopen the report before modifying it' USING ERRCODE='23514'; END IF;
  IF NEW.status<>OLD.status THEN
    IF NOT ((OLD.status='reported' AND NEW.status='in_analysis') OR (OLD.status='in_analysis' AND NEW.status='action_plan') OR
      (OLD.status='action_plan' AND NEW.status='effectiveness_review') OR (OLD.status='effectiveness_review' AND NEW.status IN ('closed','action_plan')) OR
      (OLD.status='closed' AND NEW.status='action_plan')) THEN RAISE EXCEPTION 'Invalid report transition' USING ERRCODE='23514'; END IF;
    IF NEW.owner_id IS NULL OR NEW.verifier_id IS NULL THEN RAISE EXCEPTION 'Owner and verifier are required' USING ERRCODE='23514'; END IF;
    IF NEW.status IN ('action_plan','effectiveness_review','closed') AND (length(btrim(NEW.root_cause))=0 OR length(btrim(NEW.correction))=0) THEN RAISE EXCEPTION 'Root cause and correction are required' USING ERRCODE='23514'; END IF;
    IF NEW.status IN ('effectiveness_review','closed') THEN
      SELECT count(*),count(*) FILTER(WHERE status<>'closed') INTO linked_count,open_count FROM app.actions WHERE tenant_id=NEW.tenant_id AND report_id=NEW.id;
      IF linked_count=0 OR open_count>0 THEN RAISE EXCEPTION 'Linked actions must be completed' USING ERRCODE='23514'; END IF;
    END IF;
    IF NEW.status='closed' OR (OLD.status='effectiveness_review' AND NEW.effectiveness='ineffective') THEN
      IF identity.actor_id()<>OLD.verifier_id OR NEW.reviewed_by IS DISTINCT FROM identity.actor_id() OR length(btrim(coalesce(NEW.effectiveness_note,'')))=0 THEN RAISE EXCEPTION 'Named verifier and evidence are required' USING ERRCODE='42501'; END IF;
      NEW.reviewed_at:=clock_timestamp();
    END IF;
    IF OLD.status='effectiveness_review' AND NEW.status='action_plan' AND NEW.effectiveness<>'ineffective' AND pg_trigger_depth()<=1 THEN RAISE EXCEPTION 'Only an action reopening can invalidate a pending review automatically' USING ERRCODE='42501'; END IF;
    IF NEW.status='closed' THEN
      IF NEW.effectiveness<>'effective' THEN RAISE EXCEPTION 'Effectiveness must be confirmed' USING ERRCODE='23514'; END IF;
      NEW.closed_at:=clock_timestamp();
    ELSE NEW.closed_at:=NULL;
    END IF;
  END IF;
  NEW.revision:=OLD.revision+1; NEW.updated_at:=clock_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER report_state_guard BEFORE UPDATE ON app.reports FOR EACH ROW EXECUTE FUNCTION app.guard_report_change();
CREATE FUNCTION app.record_report_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO app.report_events(tenant_id,site_id,report_id,actor_id,operation,before_data,after_data)
  VALUES(NEW.tenant_id,NEW.site_id,NEW.id,identity.actor_id(),TG_OP,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW));
  RETURN NEW;
END $$;
CREATE TRIGGER report_history AFTER INSERT OR UPDATE ON app.reports FOR EACH ROW EXECUTE FUNCTION app.record_report_change();
CREATE TRIGGER immutable_report_history BEFORE UPDATE OR DELETE ON app.report_events FOR EACH ROW EXECUTE FUNCTION app.protect_audit_history();
CREATE FUNCTION app.guard_linked_action() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE report_status text;
BEGIN
  IF NEW.report_id IS NOT NULL THEN
    SELECT status INTO report_status FROM app.reports WHERE id=NEW.report_id FOR UPDATE;
    IF report_status IS NULL THEN RAISE EXCEPTION 'Report is not accessible' USING ERRCODE='42501'; END IF;
    IF report_status<>'action_plan' THEN RAISE EXCEPTION 'Add corrective actions only during action planning' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER linked_action_guard BEFORE INSERT ON app.actions FOR EACH ROW EXECUTE FUNCTION app.guard_linked_action();
CREATE FUNCTION app.sync_report_action() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.report_id IS NOT NULL AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE app.reports SET
      status=CASE WHEN NEW.status='open' AND status IN ('closed','effectiveness_review') THEN 'action_plan' ELSE status END,
      effectiveness=CASE WHEN NEW.status='open' THEN 'not_evaluated' ELSE effectiveness END,
      effectiveness_note=CASE WHEN NEW.status='open' THEN NULL ELSE effectiveness_note END,
      reviewed_by=CASE WHEN NEW.status='open' THEN NULL ELSE reviewed_by END,
      reviewed_at=CASE WHEN NEW.status='open' THEN NULL ELSE reviewed_at END,
      last_change_note=CASE WHEN TG_OP='INSERT' THEN 'Action corrective ajoutée : ' ELSE 'Statut de l’action corrective modifié : ' END||NEW.id::text
    WHERE id=NEW.report_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER report_action_sync AFTER INSERT OR UPDATE ON app.actions FOR EACH ROW EXECUTE FUNCTION app.sync_report_action();
REVOKE ALL ON app.reports,app.report_events FROM PUBLIC,sentinelle_app;
REVOKE ALL ON FUNCTION app.guard_report_change(),app.record_report_change(),app.guard_linked_action(),app.sync_report_action() FROM PUBLIC;
GRANT SELECT ON app.reports,app.report_events TO sentinelle_app;
GRANT INSERT(id,tenant_id,site_id,title,description,kind,severity,occurred_at,reported_by,correction,currency) ON app.reports TO sentinelle_app;
GRANT UPDATE(owner_id,verifier_id,correction,root_cause,five_whys,cost_amount,currency,status,effectiveness,effectiveness_note,reviewed_by,reviewed_at,closed_at,last_change_note) ON app.reports TO sentinelle_app;
GRANT INSERT(report_id) ON app.actions TO sentinelle_app;
