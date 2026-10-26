-- Operational audits are restricted to managers/admins with access to the site.
-- Confidential anticorruption investigations must use a separate authorization model.
CREATE FUNCTION app.valid_audit_checklist(items jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE item jsonb; seen text[] := '{}';
BEGIN
  IF jsonb_typeof(items)<>'array' OR jsonb_array_length(items)>30 THEN RETURN false; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP
    IF jsonb_typeof(item)<>'object' OR NOT (item ?& ARRAY['id','clause','question','result','evidence'])
      OR (item - ARRAY['id','clause','question','result','evidence'])<>'{}'::jsonb THEN RETURN false; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_each(item) WHERE jsonb_typeof(value)<>'string') THEN RETURN false; END IF;
    IF (item->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR item->>'id'=ANY(seen) OR length(btrim(item->>'question')) NOT BETWEEN 1 AND 500
      OR length(btrim(item->>'clause')) NOT BETWEEN 1 AND 100 OR length(item->>'evidence')>1000
      OR item->>'result' NOT IN ('pending','conform','nonconform','not_applicable') THEN RETURN false; END IF;
    seen:=array_append(seen,item->>'id');
  END LOOP;
  RETURN true;
END $$;
CREATE TABLE app.audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES app.tenants(id), site_id uuid NOT NULL,
  title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 300),
  standard text NOT NULL CHECK(length(btrim(standard)) BETWEEN 1 AND 200),
  scope text NOT NULL CHECK(length(btrim(scope)) BETWEEN 1 AND 4000),
  starts_on date NOT NULL, ends_on date NOT NULL CHECK(ends_on>=starts_on),
  lead_id uuid NOT NULL, auditee_id uuid NOT NULL CHECK(auditee_id<>lead_id), created_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','in_progress','completed','cancelled')),
  checklist jsonb NOT NULL DEFAULT '[]' CHECK(app.valid_audit_checklist(checklist)),
  conclusion text NOT NULL DEFAULT '' CHECK(length(conclusion)<=4000),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  report_snapshot jsonb, completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id,site_id),
  FOREIGN KEY(tenant_id,site_id) REFERENCES app.sites(tenant_id,id),
  FOREIGN KEY(tenant_id,lead_id) REFERENCES identity.memberships(tenant_id,user_id),
  FOREIGN KEY(tenant_id,auditee_id) REFERENCES identity.memberships(tenant_id,user_id),
  FOREIGN KEY(tenant_id,created_by) REFERENCES identity.memberships(tenant_id,user_id)
);
CREATE INDEX audits_list_idx ON app.audits(tenant_id,site_id,starts_on DESC,id);
CREATE INDEX audits_lead_idx ON app.audits(tenant_id,lead_id);
CREATE INDEX audits_auditee_idx ON app.audits(tenant_id,auditee_id);
CREATE INDEX audits_creator_idx ON app.audits(tenant_id,created_by);
CREATE TABLE app.audit_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, site_id uuid NOT NULL, audit_id uuid NOT NULL,
  item_id uuid NOT NULL, report_id uuid NOT NULL, created_by uuid NOT NULL REFERENCES identity.users(id), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,audit_id,item_id), UNIQUE(tenant_id,report_id),
  FOREIGN KEY(tenant_id,audit_id,site_id) REFERENCES app.audits(tenant_id,id,site_id),
  FOREIGN KEY(tenant_id,report_id,site_id) REFERENCES app.reports(tenant_id,id,site_id)
);
CREATE INDEX audit_findings_report_idx ON app.audit_findings(tenant_id,report_id,site_id);
CREATE INDEX audit_findings_creator_idx ON app.audit_findings(created_by);
CREATE TABLE app.audit_session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, site_id uuid NOT NULL, audit_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES identity.users(id), operation text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(), before_data jsonb, after_data jsonb NOT NULL,
  FOREIGN KEY(tenant_id,audit_id,site_id) REFERENCES app.audits(tenant_id,id,site_id)
);
CREATE INDEX audit_session_events_parent_idx ON app.audit_session_events(tenant_id,audit_id,occurred_at DESC);
CREATE INDEX audit_session_events_site_idx ON app.audit_session_events(tenant_id,site_id);
CREATE INDEX audit_session_events_actor_idx ON app.audit_session_events(actor_id);
ALTER TABLE app.audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audits FORCE ROW LEVEL SECURITY;
ALTER TABLE app.audit_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audit_findings FORCE ROW LEVEL SECURITY;
ALTER TABLE app.audit_session_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audit_session_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audits_read ON app.audits FOR SELECT USING(identity.can_write_site(tenant_id,site_id));
CREATE POLICY audits_create ON app.audits FOR INSERT WITH CHECK(identity.can_write_site(tenant_id,site_id) AND created_by=identity.actor_id());
CREATE POLICY audits_update ON app.audits FOR UPDATE USING(identity.can_write_site(tenant_id,site_id)) WITH CHECK(identity.can_write_site(tenant_id,site_id));
CREATE POLICY audit_findings_read ON app.audit_findings FOR SELECT USING(identity.can_write_site(tenant_id,site_id));
CREATE POLICY audit_findings_create ON app.audit_findings FOR INSERT WITH CHECK(identity.can_write_site(tenant_id,site_id) AND created_by=identity.actor_id());
CREATE POLICY audit_session_events_read ON app.audit_session_events FOR SELECT USING(identity.can_write_site(tenant_id,site_id));
CREATE POLICY audit_session_events_append ON app.audit_session_events FOR INSERT WITH CHECK(identity.can_write_site(tenant_id,site_id));

CREATE FUNCTION app.guard_audit_session() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE item jsonb; previous jsonb; finding record;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NOT identity.can_review_site(NEW.tenant_id,NEW.site_id,NEW.lead_id) OR NOT identity.can_review_site(NEW.tenant_id,NEW.site_id,NEW.auditee_id)
      OR NEW.status<>'planned' OR NEW.report_snapshot IS NOT NULL OR NEW.completed_at IS NOT NULL
      OR NEW.conclusion<>'' OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.checklist) x WHERE x->>'result'<>'pending' OR x->>'evidence'<>'') THEN
      RAISE EXCEPTION 'Invalid audit plan or participants' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'Audit is frozen' USING ERRCODE='23514'; END IF;
  IF NEW.status<>OLD.status THEN
    IF NOT ((OLD.status='planned' AND NEW.status IN ('in_progress','cancelled')) OR (OLD.status='in_progress' AND NEW.status='completed')) THEN
      RAISE EXCEPTION 'Invalid audit transition' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW.status<>'cancelled' AND identity.actor_id()<>OLD.lead_id THEN RAISE EXCEPTION 'Only the lead auditor can execute this audit' USING ERRCODE='42501'; END IF;
  IF OLD.status='in_progress' THEN
    IF jsonb_array_length(NEW.checklist)<>jsonb_array_length(OLD.checklist) THEN RAISE EXCEPTION 'Checklist questions are frozen after start' USING ERRCODE='23514'; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(OLD.checklist) LOOP
      SELECT value INTO previous FROM jsonb_array_elements(NEW.checklist) WHERE value->>'id'=item->>'id';
      IF previous IS NULL OR (previous - ARRAY['result','evidence'])<>(item - ARRAY['result','evidence']) THEN
        RAISE EXCEPTION 'Checklist questions are frozen after start' USING ERRCODE='23514'; END IF;
    END LOOP;
  END IF;
  IF OLD.status='planned' AND EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.checklist) x WHERE x->>'result'<>'pending' OR x->>'evidence'<>'') THEN
    RAISE EXCEPTION 'Start audit before recording evidence' USING ERRCODE='23514'; END IF;
  IF NEW.status='in_progress' AND jsonb_array_length(NEW.checklist)=0 THEN RAISE EXCEPTION 'Checklist required' USING ERRCODE='23514'; END IF;
  FOR finding IN SELECT item_id FROM app.audit_findings WHERE tenant_id=NEW.tenant_id AND audit_id=NEW.id LOOP
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.checklist) x WHERE x->>'id'=finding.item_id::text AND x->>'result'='nonconform') THEN
      RAISE EXCEPTION 'Linked findings cannot be removed or reclassified' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF NEW.status IN ('completed','cancelled') AND length(btrim(NEW.conclusion))=0 THEN RAISE EXCEPTION 'Conclusion or cancellation reason required' USING ERRCODE='23514'; END IF;
  IF NEW.status='completed' THEN
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.checklist) x WHERE x->>'result'='pending' OR length(btrim(x->>'evidence'))=0
      OR (x->>'result'='nonconform' AND NOT EXISTS(SELECT 1 FROM app.audit_findings f WHERE f.audit_id=NEW.id AND f.item_id::text=x->>'id'))) THEN
      RAISE EXCEPTION 'Answer every question with evidence and register each nonconformity' USING ERRCODE='23514'; END IF;
    NEW.completed_at:=clock_timestamp();
    NEW.report_snapshot:=jsonb_build_object('title',NEW.title,'standard',NEW.standard,'scope',NEW.scope,'siteId',NEW.site_id,
      'startsOn',NEW.starts_on,'endsOn',NEW.ends_on,'leadId',NEW.lead_id,'auditeeId',NEW.auditee_id,'completedBy',identity.actor_id(),
      'completedAt',NEW.completed_at,'conclusion',NEW.conclusion,'checklist',NEW.checklist,
      'findings',coalesce((SELECT jsonb_agg(jsonb_build_object('itemId',f.item_id,'reportId',f.report_id) ORDER BY f.item_id) FROM app.audit_findings f WHERE f.audit_id=NEW.id),'[]'::jsonb));
  END IF;
  NEW.revision:=OLD.revision+1; NEW.updated_at:=clock_timestamp(); RETURN NEW;
END $$;
CREATE TRIGGER audit_session_guard BEFORE INSERT OR UPDATE ON app.audits FOR EACH ROW EXECUTE FUNCTION app.guard_audit_session();
CREATE FUNCTION app.guard_audit_finding() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE parent app.audits;
BEGIN
  SELECT * INTO parent FROM app.audits WHERE tenant_id=NEW.tenant_id AND id=NEW.audit_id FOR UPDATE;
  IF parent.id IS NULL OR parent.status<>'in_progress' OR parent.lead_id<>identity.actor_id() THEN RAISE EXCEPTION 'Only the lead auditor can register an active finding' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(parent.checklist) x WHERE x->>'id'=NEW.item_id::text AND x->>'result'='nonconform' AND length(btrim(x->>'evidence'))>0)
    OR NOT EXISTS(SELECT 1 FROM app.reports r WHERE r.id=NEW.report_id AND r.tenant_id=NEW.tenant_id AND r.site_id=NEW.site_id AND r.kind='nonconformity' AND r.reported_by=identity.actor_id()) THEN
    RAISE EXCEPTION 'Finding requires nonconformity evidence and a scoped report' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER audit_finding_guard BEFORE INSERT ON app.audit_findings FOR EACH ROW EXECUTE FUNCTION app.guard_audit_finding();
CREATE FUNCTION app.bump_audit_finding() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  UPDATE app.audits SET checklist=checklist WHERE tenant_id=NEW.tenant_id AND id=NEW.audit_id;
  RETURN NEW;
END $$;
CREATE TRIGGER audit_finding_revision AFTER INSERT ON app.audit_findings FOR EACH ROW EXECUTE FUNCTION app.bump_audit_finding();
CREATE FUNCTION app.record_audit_session() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO app.audit_session_events(tenant_id,site_id,audit_id,actor_id,operation,before_data,after_data)
    VALUES(NEW.tenant_id,NEW.site_id,NEW.id,identity.actor_id(),TG_OP,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW));
  RETURN NEW;
END $$;
CREATE TRIGGER audit_session_history AFTER INSERT OR UPDATE ON app.audits FOR EACH ROW EXECUTE FUNCTION app.record_audit_session();
CREATE TRIGGER immutable_audit_session_history BEFORE UPDATE OR DELETE ON app.audit_session_events FOR EACH ROW EXECUTE FUNCTION app.protect_audit_history();
CREATE TRIGGER immutable_audit_finding BEFORE UPDATE OR DELETE ON app.audit_findings FOR EACH ROW EXECUTE FUNCTION app.protect_audit_history();
REVOKE ALL ON app.audits,app.audit_findings,app.audit_session_events FROM PUBLIC,sentinelle_app;
REVOKE ALL ON FUNCTION app.valid_audit_checklist(jsonb),app.guard_audit_session(),app.guard_audit_finding(),app.bump_audit_finding(),app.record_audit_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.valid_audit_checklist(jsonb) TO sentinelle_app;
GRANT SELECT ON app.audits,app.audit_findings,app.audit_session_events TO sentinelle_app;
GRANT INSERT(id,tenant_id,site_id,title,standard,scope,starts_on,ends_on,lead_id,auditee_id,created_by) ON app.audits TO sentinelle_app;
GRANT UPDATE(checklist,status,conclusion) ON app.audits TO sentinelle_app;
GRANT INSERT(id,tenant_id,site_id,audit_id,item_id,report_id,created_by) ON app.audit_findings TO sentinelle_app;
